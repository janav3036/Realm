import random
import time
import uuid

import os
from flask import Flask, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room

from game_logic import (
    distribute_resources, handle_seven,
    can_place_road, can_place_settlement, can_upgrade_city,
    place_road, place_settlement, upgrade_city, deduct_building_cost,
    move_robber,
    validate_player_trade, execute_player_trade, execute_bank_trade,
    update_longest_road_award, update_largest_army_award,
    check_win_condition, advance_turn, get_next_setup_player,
)
from board_generator import generate_board
from room_manager import create_room, get_room, add_player_to_room, remove_player, get_room_by_socket, update_player_socket
from card_system import create_deck, draw_card, resolve_action_card

CLIENT_DIST = os.path.join(os.path.dirname(__file__), '..', 'client', 'dist')

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret"
socket_io = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet", manage_session=False)

COLORS = ["red", "blue", "orange", "yellow"]

def make_player(player_id, name, color, socket_id):
    return {
        "id": player_id, "name": name, "color": color,
        "resources": {"timber": 0, "stone": 0, "grain": 0, "wool": 0, "ore": 0},
        "hand": [], "structures_in_play": [],
        "buildings": {"settlements": [], "cities": [], "roads": []},
        "pieces_remaining": {"settlements": 5, "cities": 4, "roads": 15},
        "victory_points": 0, "vp_cards": 0,
        "sabotage_cards_played": 0, "longest_road_length": 0,
        "connected": True, "socket_id": socket_id,
    }

def init_game_state(room):
    board = generate_board()
    desert = next(h for h in board["hexes"] if h["resource"] == "desert")
    player_ids = list(room["players"].keys())
    random.shuffle(player_ids)
    players = {
        pid: make_player(pid, room["players"][pid]["name"], COLORS[i], room["players"][pid]["socket_id"])
        for i, pid in enumerate(player_ids)
    }
    return {
        "board": board,
        "players": players,
        "player_order": player_ids,
        "turn": {
            "current_player": player_ids[0],
            "phase": "setup_s1",
            "setup_round": 1,
            "setup_order": player_ids[:],
            "dice": None, "dice_total": None, "rolled": False,
            "turn_number": 1, "active_trade": None, "must_discard": [],
        },
        "robber_hex": desert["id"],
        "longest_road_owner": None, "largest_army_owner": None,
        "deck": {"draw_pile": create_deck(), "discard_pile": []},
        "winner": None, "game_log": [],
    }

def log(state, player_id, event):
    state["game_log"].append({
        "turn": state["turn"]["turn_number"],
        "player": player_id, "event": event, "timestamp": time.time(),
    })

def broadcast(room_code, state):
    socket_io.emit("state_update", state, to=room_code)

#-- LOBBY ---------------------------------------------------------------------------------

@socket_io.on("create_room")
def on_create_room(data):
    player_name = data.get("player_name", "Player")
    player_id = str(uuid.uuid4())[:8]
    room_code = create_room(player_id, player_name, request.sid)
    join_room(room_code)
    emit("room_created", {"room_code": room_code, "player_id": player_id})

@socket_io.on("join_room")
def on_join_room(data):
    room_code = data.get("room_code", "").upper().strip()
    player_name = data.get("player_name", "Player")
    room = get_room(room_code)
    if not room:
        emit("error", {"code": "NOT_FOUND", "message": "Room not found"})
        return
    player_id = str(uuid.uuid4())[:8]
    ok, reason = add_player_to_room(room_code, player_id, player_name, request.sid)
    if not ok:
        emit("error", {"code": "JOIN_FAILED", "message": reason})
        return
    join_room(room_code)
    emit("joined_room", {"room_code": room_code, "player_id": player_id})
    broadcast(room_code, {"status": "lobby", "room_code": room_code,
                          "host": room["host_player_id"], "players": room["players"]})
    
@socket_io.on("start_game")
def on_start_game(data):
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    room = get_room(room_code)
    if not room:
        emit("error", {"code": "NOT_FOUND", "message": "Room not found"})
        return
    if room["host_player_id"] != player_id:
        emit("error", {"code": "NOT_HOST", "message": "Only the host can start the game"})
        return
    if room["status"] != "lobby":
        emit("error", {"code": "ALREADY_STARTED", "message": "Game already in progress"})
        return
    if len(room["players"]) < 2:
        emit("error", {"code": "TOO_FEW", "message": "Need at least 2 players"})
        return
    state = init_game_state(room)
    room["game_state"] = state
    room["status"] = "setup"
    broadcast(room_code, state)

#-- ACTIONS --------------------------------------------------------------------------------

NON_ACTIVE_OK = {"discard_resources", "respond_trade"}

@socket_io.on("action")
def on_action(data):
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    action = data.get("action", {})
    room = get_room(room_code)
    if not room or not room.get("game_state"):
        emit("error", {"code": "NOT_FOUND", "message": "Room/game not found"})
        return
    state = room["game_state"]
    action_type = action.get("type")
    if state["turn"]["current_player"] != player_id and action_type not in NON_ACTIVE_OK:
        emit("error", {"code": "NOT_YOUR_TURN", "message": "Not your turn"})
        return
    error = _dispatch(state, player_id, action)
    if error:
        emit("error", {"code": "INVALID", "message": error})
        return
    winner = check_win_condition(state)
    if winner and not state["winner"]:
        state["winner"] = winner
        state["game_over"] = True
        room["status"] = "ended"
        log(state, winner, "wins!")
    broadcast(room_code, state)

def _dispatch(state, player_id, action):
    t = action.get("type")
    handlers = {
        "place_setup_settlement": _setup_settlement,
        "place_setup_road":       _setup_road,
        "draw_card":              lambda s, p, a: _draw(s, p),
        "roll_dice":              lambda s, p, a: _roll(s, p),
        "discard_resources":      _discard,
        "move_robber":            _move_robber,
        "play_card":              _play_card,
        "buy_extra_card":         lambda s, p, a: _buy_card(s, p),
        "build_road":             _build_road,
        "build_settlement":       _build_settlement,
        "build_city":             _build_city,
        "propose_trade":          _propose_trade,
        "respond_trade":          _respond_trade,
        "bank_trade":             _bank_trade,
        "end_turn":               lambda s, p, a: _end_turn(s, p),
    }
    handler = handlers.get(t)
    if not handler:
        return f"Unknown action: {t}"
    return handler(state, player_id, action)

#-- SETUP HELPERS ------------------------------------------------------------------------------

def _setup_settlement(state, player_id, action):
    if state["turn"]["phase"] not in ("setup_s1", "setup_s2"):
        return "Wrong phase"
    vid = action["vertex_id"]
    ok, reason = can_place_settlement(state, vid, player_id, setup=True)
    if not ok:
        return reason
    place_settlement(state, vid, player_id)
    state["turn"]["phase"] = "setup_road"
    log(state, player_id, f"setup settlement at vertex {vid}")


def _setup_road(state, player_id, action):
    if state["turn"]["phase"] != "setup_road":
        return "Wrong phase"
    eid = action["edge_id"]
    edge = state["board"]["edges"][eid]
    if edge["road"] is not None:
        return "Edge occupied"
    owned = set(state["players"][player_id]["buildings"]["settlements"])
    if not any(vid in owned for vid in edge["vertices"]):
        return "Road must touch your settlement"
    place_road(state, eid, player_id)
    log(state, player_id, f"setup road at edge {eid}")

    # Round 2: grant resources for that settlement
    if state["turn"]["setup_round"] == 2:
        last_vid = state["players"][player_id]["buildings"]["settlements"][-1]
        vertex = state["board"]["vertices"][last_vid]
        for hid in vertex["adjacent_hexes"]:
            h = state["board"]["hexes"][hid]
            if h["resource"] != "desert":
                state["players"][player_id]["resources"][h["resource"]] += 1

    next_p = get_next_setup_player(state)
    if next_p is None:
        # Setup done — deal 4 cards each, begin main game
        for pid in state["player_order"]:
            for _ in range(4):
                draw_card(state, pid)
        state["turn"]["current_player"] = state["player_order"][0]
        state["turn"]["phase"] = "draw"
    else:
        state["turn"]["current_player"] = next_p
        r = state["turn"]["setup_round"]
        state["turn"]["phase"] = f"setup_s{r}"


# ── Main turn helpers ──

def _draw(state, player_id):
    if state["turn"]["phase"] != "draw":
        return "Not in draw phase"
    draw_card(state, player_id)
    state["turn"]["phase"] = "roll"
    log(state, player_id, "drew a card")


def _roll(state, player_id):
    if state["turn"]["phase"] != "roll":
        return "Not in roll phase"
    d1, d2 = random.randint(1, 6), random.randint(1, 6)
    total = d1 + d2
    state["turn"].update({"dice": [d1, d2], "dice_total": total, "rolled": True})
    log(state, player_id, f"rolled {d1}+{d2}={total}")
    if total == 7:
        handle_seven(state, player_id)
    else:
        distribute_resources(state, total)
        state["turn"]["phase"] = "action"


def _discard(state, player_id, action):
    resources = action.get("resources", {})
    player = state["players"][player_id]
    expected = sum(player["resources"].values()) // 2
    if sum(resources.values()) != expected:
        return f"Must discard exactly {expected}"
    for r, amt in resources.items():
        if player["resources"].get(r, 0) < amt:
            return f"Not enough {r}"
        player["resources"][r] -= amt
    must = state["turn"].get("must_discard", [])
    if player_id in must:
        must.remove(player_id)
    if not must:
        state["turn"]["phase"] = "robber"
    log(state, player_id, "discarded")


def _move_robber(state, player_id, action):
    if state["turn"]["phase"] != "robber":
        return "Not in robber phase"
    hex_id = action["hex_id"]
    if hex_id == state["robber_hex"]:
        return "Robber must move to a different hex"
    move_robber(state, hex_id, action.get("steal_from"), player_id)
    log(state, player_id, f"moved robber to hex {hex_id}")

def _play_card(state, player_id, action):
    if state["turn"]["phase"] != "action":
        return "Can only play cards during the action phase"
    card_id = action["card_id"]
    player = state["players"][player_id]
    card = next((c for c in player["hand"] if c["id"] == card_id), None)
    if not card:
        return "Card not in hand"
    if card["type"] == "vp":
        return "Cannot play Victory Point cards"
    card_name = card["name"]
    target = {k: v for k, v in action.items() if k not in ("type", "card_id")}
    resolve_action_card(state, card_id, player_id, target)
    update_largest_army_award(state)
    if card_name == "Sabotage":
        state["turn"]["phase"] = "robber"
    log(state, player_id, f"played {card_name}")



def _buy_card(state, player_id):
    if state["turn"]["phase"] != "action":
        return "Can only buy cards during the action phase"
    player = state["players"][player_id]
    for r, amt in {"ore": 1, "grain": 1, "wool": 1}.items():
        if player["resources"].get(r, 0) < amt:
            return "Insufficient resources"
    for r in ("ore", "grain", "wool"):
        player["resources"][r] -= 1
    draw_card(state, player_id)
    log(state, player_id, "bought extra card")

def _militia_blocked(state, player_id):
    if state["turn"].get("militia_target") != player_id:
        return False
    player = state["players"][player_id]
    return not any(s["card_name"] == "Barracks" for s in player.get("structures_in_play", []))

def _build_road(state, player_id, action):
    if _militia_blocked(state, player_id):
        return "The Militia has blocked your construction this turn"
    reinforce = state["turn"].get("reinforce_active", False)
    ok, reason = can_place_road(state, action["edge_id"], player_id, free=reinforce)
    if not ok:
        return reason
    place_road(state, action["edge_id"], player_id)
    if not reinforce:
        deduct_building_cost(state, player_id, "road")
    else:
        state["turn"]["reinforce_active"] = False
    update_longest_road_award(state)
    log(state, player_id, f"built road at edge {action['edge_id']}")



def _build_settlement(state, player_id, action):
    if _militia_blocked(state, player_id):
        return "The Militia has blocked your construction this turn"
    ok, reason = can_place_settlement(state, action["vertex_id"], player_id)
    if not ok:
        return reason
    place_settlement(state, action["vertex_id"], player_id)
    deduct_building_cost(state, player_id, "settlement")
    log(state, player_id, f"built settlement at vertex {action['vertex_id']}")


def _build_city(state, player_id, action):
    if _militia_blocked(state, player_id):
        return "The Militia has blocked your construction this turn"
    ok, reason = can_upgrade_city(state, action["vertex_id"], player_id)
    if not ok:
        return reason
    upgrade_city(state, action["vertex_id"], player_id)
    deduct_building_cost(state, player_id, "city")
    log(state, player_id, f"upgraded city at vertex {action['vertex_id']}")


def _propose_trade(state, player_id, action):
    ok, reason = validate_player_trade(
        state, player_id, action["to_player"], action["offering"], action["requesting"])
    if not ok:
        return reason
    state["turn"]["active_trade"] = {
        "from_player": player_id, "to_player": action["to_player"],
        "offering": action["offering"], "requesting": action["requesting"],
        "status": "pending",
    }
    log(state, player_id, "proposed trade")


def _respond_trade(state, player_id, action):
    trade = state["turn"].get("active_trade")
    if not trade or trade["to_player"] != player_id:
        return "No active trade for you"
    if action.get("accept"):
        execute_player_trade(state, trade["from_player"], trade["to_player"],
                              trade["offering"], trade["requesting"])
        log(state, player_id, "accepted trade")
    else:
        log(state, player_id, "rejected trade")
    state["turn"]["active_trade"] = None


def _bank_trade(state, player_id, action):
    ok, _, reason = execute_bank_trade(state, player_id, action["giving"], action["receiving"])
    if not ok:
        return reason
    if state["turn"].get("caravan_active"):
        state["turn"]["caravan_active"] = False
    log(state, player_id, "bank trade")



def _end_turn(state, player_id):
    if state["turn"]["phase"] != "action":
        return "Cannot end turn now"
    advance_turn(state)
    state["turn"]["phase"] = "draw"
    log(state, player_id, "ended turn")


# ── QUIT / END GAME ──────────────────────────────────────────────────────────

def _handle_player_quit(room_code, player_id, room):
    state = room.get("game_state")
    if not state or player_id not in state.get("players", {}):
        return

    state["players"][player_id]["connected"] = False
    log(state, player_id, "disconnected")

    active = [p for p in state["player_order"]
              if state["players"][p].get("connected", True)]
    
    if not active:
        room["status"] = "ended"
        return
    
    if len(active) == 1:
        winner = active[0]
        state["winner"] = winner
        state["game_over"] = True
        room["status"] = "ended"
        log(state, winner, "wins - last player remaining")
        broadcast(room_code, state)
        return
    
    if state["turn"]["current_player"] == player_id:
        order = state["player_order"]
        idx = order.index(player_id)
        next_players = [order[(idx+i) % len(order)] for i in range(1, len(order))]
        next_connected = next(
            (p for p in next_players if state["players"][p].get("connected", True)), None
        )
        if next_connected:
            phase = state["turn"]["phase"]
            if phase in ("setup_s1", "setup_s2", "setup_road"):
                state["turn"]["setup_order"] = [
                    p for p in state["turn"].get("setup_order", []) if p != player_id
                ]
                state["turn"]["current_player"] = next_connected
                state["turn"]["phase"] = f"setup_s{state['turn']['setup_round']}"
            else:
                state["turn"].update({
                    "current_player": next_connected,
                    "phase": "draw",
                    "rolled": False,
                    "dice": None,
                    "dice_total": None,
                    "active_trade": None,
                    "must_discard": [],
                })
                state["turn"]["turn_number"] = state["turn"].get("turn_number", 1) + 1

    broadcast(room_code, state)

@socket_io.on("reconnect_player")
def on_reconnect_player(data):
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    room = get_room(room_code)
    if not room:
        emit("error", {"code": "NOT_FOUND", "message": "Game not found"})
        return

    # Lobby reconnect: game hasn't started yet
    if not room.get("game_state"):
        if player_id not in room.get("players", {}):
            emit("error", {"code": "NOT_FOUND", "message": "Player not in this room"})
            return
        update_player_socket(room_code, player_id, request.sid)
        join_room(room_code)
        emit("joined_room", {"room_code": room_code, "player_id": player_id})
        broadcast(room_code, {"status": "lobby", "room_code": room_code,
                              "host": room["host_player_id"], "players": room["players"]})
        return

    state = room["game_state"]
    if player_id not in state["players"]:
        emit("error", {"code": "NOT_FOUND", "message": "Player not in this game"})
        return
    update_player_socket(room_code, player_id, request.sid)
    state["players"][player_id]["socket_id"] = request.sid
    state["players"][player_id]["connected"] = True
    join_room(room_code)
    log(state, player_id, "reconnected")
    emit("reconnected", {
        "room_code": room_code,
        "player_id": player_id,
        "is_host": room["host_player_id"] == player_id,
        "state": state,
    })
    broadcast(room_code, state)



@socket_io.on("quit_game")
def on_quit_game(data):
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    room = get_room(room_code)
    if not room or not room.get("game_state"):
        return
    _handle_player_quit(room_code, player_id, room)


@socket_io.on("end_game")
def on_end_game(data):
    room_code = data.get("room_code")
    player_id = data.get("player_id")
    room = get_room(room_code)
    if not room or not room.get("game_state"):
        emit("error", {"code": "NOT_FOUND", "message": "No active game"})
        return
    if room["host_player_id"] != player_id:
        emit("error", {"code": "NOT_HOST", "message": "Only the host can end the game"})
        return
    state = room["game_state"]
    state["winner"] = None
    state["game_over"] = True
    room["status"] = "ended"
    log(state, player_id, "ended the game")
    broadcast(room_code, state)


# ── CHAT / DISCONNECT ─────────────────────────────────────────────────────────

@socket_io.on("chat")
def on_chat(data):
    room_code = data.get("room_code")
    room = get_room(room_code)
    if not room:
        return
    name = room["players"].get(data.get("player_id"), {}).get("name", "Unknown")
    socket_io.emit("chat_message",
                  {"player_name": name, "message": data.get("message", ""), "timestamp": time.time()},
                  to=room_code)


@socket_io.on("disconnect")
def on_disconnect():
    room_code, player_id = get_room_by_socket(request.sid)
    if not room_code:
        return
    room = get_room(room_code)
    if not room:
        return
    if room.get("game_state") and player_id in room["game_state"].get("players", {}):
        _handle_player_quit(room_code, player_id, room)
    else:
        name = room["players"].get(player_id, {}).get("name", "Unknown")
        socket_io.emit("player_disconnected",
                       {"player_id": player_id, "player_name": name},
                       to=room_code)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_client(path):
    if path and os.path.exists(os.path.join(CLIENT_DIST, path)):
        return send_from_directory(CLIENT_DIST, path)
    return send_from_directory(CLIENT_DIST, 'index.html')

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    socket_io.run(app, debug=debug, port=5050)

