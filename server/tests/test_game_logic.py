import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game_logic import (
    distribute_resources, handle_seven, can_place_settlement, can_place_road,
    can_upgrade_city, place_settlement, 
    calculate_vp, check_win_condition, advance_turn
)
from board_generator import generate_board

def make_state():
    board = generate_board()
    player_id = "p1"
    state = {
        "board": board, 
        "players": {
            player_id: {
                "id": player_id,
                "resources": {"timber": 5, "stone": 5, "grain": 5, "wool": 5, "ore": 5},
                "hand": [],
                "buildings": {"settlements": [], "cities": [], "roads": []},
                "pieces_remaining": {"settlements": 5, "cities": 4, "roads": 15},
                "victory_points": 0,
                "vp_cards": 0,
                "sabotage_cards_played": 0,
                "longest_road_length": 0,
            }
        },
        "player_order": [player_id],
        "turn": {
            "current_player": player_id,
            "turn_number": 1,
            "rolled": False,
            "dice": None,
            "dice_total": None,
            "phase": "action",
            "active_trade": None,
            "setup_round": 1,
            "setup_order": [player_id],
        },
        "robber_hex": 0,
        "longest_road_owner": None,
        "largest_army_owner": None,
        "deck": {"draw_pile": [], "discard_pile": []},
        "winner": None,
        "game_log": [],
    }

    return state

def test_distribute_resources():
    state = make_state()
    board = state["board"]
    player_id = "p1"

    # Find a non-desert hex with a number token
    hex_ = next(h for h in board["hexes"] if h["number"] is not None)
    vid = hex_["adjacent_vertices"][0]

    # Place a settlement there
    board["vertices"][vid]["building"] = "settlement"
    board["vertices"][vid]["owner"] = player_id

    before = state["players"][player_id]["resources"][hex_["resource"]]
    state = distribute_resources(state, hex_["number"])
    after = state["players"][player_id]["resources"][hex_["resource"]]

    assert after == before + 1

def test_distance_rule():
    state = make_state()
    board = state["board"]
    player_id = "p1"

    # Place a settlement on vertex 0
    vid = 0
    board["vertices"][vid]["building"] = "settlement"
    board["vertices"][vid]["owner"] = player_id

    # Try to place on an adjacent vertex — should fail
    adj_vid = board["vertices"][vid]["adjacent_vertices"][0]
    valid, reason = can_place_settlement(state, adj_vid, player_id, setup=True)

    assert valid is False
    assert "close" in reason.lower()

def test_check_win_condition():
    state = make_state()
    player_id = "p1"
    player = state["players"][player_id]
    player["victory_points"] = 9

    winner = check_win_condition(state)
    assert winner is None

    player["victory_points"] = 10
    winner = check_win_condition(state)
    assert winner == player_id

def test_advance_turn():
    state = make_state()
    state["player_order"] = ["p1", "p2"]
    state["players"]["p2"] = state["players"]["p1"].copy()

    state = advance_turn(state)
    assert state["turn"]["current_player"] == "p2"

    state = advance_turn(state)
    assert state["turn"]["current_player"] == "p1"
