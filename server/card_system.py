import random
import uuid

DECK_COMPOSITION = {
    "Harvest":   4,
    "Plunder":   4,
    "Sabotage":  4,
    "Caravan":   3,
    "Reinforce": 3,
    "Militia":   3,
    "Surplus":   3,
    "Watchtower": 2,
    "Granary":    2,
    "Forge":      2,
    "Harbour":    2,
    "Barracks":   2,
    "Drought":    2,
    "Gold Rush":  2,
    "Earthquake": 2,
    "Festival":   2,
    "Plague":     2,
    "Victory Point": 5,
}

CARD_TYPES = {
    "Harvest": "action", "Plunder": "action", "Sabotage": "action",
    "Caravan": "action", "Reinforce": "action", "Militia": "action", "Surplus": "action",
    "Watchtower": "structure", "Granary": "structure", "Forge": "structure",
    "Harbour": "structure", "Barracks": "structure",
    "Drought": "event", "Gold Rush": "event", "Earthquake": "event",
    "Festival": "event", "Plague": "event",
    "Victory Point": "vp",
}

STRUCTURE_CARDS = {"Watchtower", "Granary", "Forge", "Harbour", "Barracks"}

def create_deck():
    deck = []
    for card_name, count in DECK_COMPOSITION.items():
        deck.extend([card_name] * count)
    random.shuffle(deck)
    return deck

def draw_card(state, player_id):
    deck = state["deck"]

    if not deck["draw_pile"]:
        deck["draw_pile"] = deck["discard_pile"][:]
        random.shuffle(deck["draw_pile"])
        deck["discard_pile"] = []

    card_name = deck["draw_pile"].pop()
    card_type = CARD_TYPES[card_name]

    if card_type == "event":
        state = resolve_event_card(state, card_name)
        deck["discard_pile"].append(card_name)
        return draw_card(state, player_id)

    card_instance = {
        "id": str(uuid.uuid4()),
        "type": card_type,
        "name": card_name,
    }
    state["players"][player_id]["hand"].append(card_instance)
    return state

def resolve_event_card(state, card_name):
    players = state["players"]

    if card_name == "Gold Rush":
        for player in players.values():
            player["resources"]["ore"] += 1

    elif card_name == "Festival":
        for player_id in players:
            state = draw_card(state, player_id)
            state = draw_card(state, player_id)
    
    elif card_name == "Plague":
        for player in players.values():
            total = sum(player["resources"].values())
            if total >= 6:
                discarded = 0
                for resource in player["resources"]:
                    while player["resources"][resource] > 0 and discarded < 2:
                        player["resources"][resource] -= 1
                        discarded += 1

    elif card_name == "Earthquake":
        board = state["board"]
        hex_ = random.choice(board["hexes"])
        for edge in board["edges"]:
            v0, v1 = edge["vertices"]
            v0_hexes = board["vertices"][v0]["adjacent_hexes"]
            v1_hexes = board["vertices"][v1]["adjacent_hexes"]
            if hex_["id"] in v0_hexes and hex_["id"] in v1_hexes:
                if edge["road"] is not None:
                    owner = edge["road"]
                    players[owner]["buildings"]["roads"].remove(edge["id"])
                    players[owner]["pieces_remaining"]["roads"] += 1
                    edge["road"] = None


    elif card_name == "Drought":
        state["turn"]["drought_active"] = True

    return state

def resolve_action_card(state, card_id, player_id, target):
    player = state["players"][player_id]

    card = next((c for c in player["hand"] if c["id"] == card_id), None)
    if card is None:
        return state
    
    card_name = card["name"]
    is_structure = card_name in STRUCTURE_CARDS

    
    if card_name == "Harvest":
        resource = target.get("resource")
        if resource:
            player["resources"][resource] += 2

    elif card_name == "Plunder":
        steal_from = target.get("target_player")
        if steal_from:
            target_player = state["players"][steal_from]
            pool = [r for r, amt in target_player["resources"].items() for _ in range(amt)]
            if pool:
                stolen = random.choice(pool)
                target_player["resources"][stolen] -= 1
                player["resources"][stolen] += 1

    elif card_name == "Sabotage":
        player["sabotage_cards_played"] += 1

    elif card_name == "Caravan":
        state["turn"]["caravan_active"] = True

    elif card_name == "Reinforce":
        state["turn"]["reinforce_active"] = True

    elif card_name == "Surplus":
        dice_total = state["turn"].get("dice_total")
        if dice_total:
            board = state["board"]
            for hex_ in board["hexes"]:
                if hex_["number"] != dice_total or hex_["has_robber"]:
                    continue
                for vid in hex_["adjacent_vertices"]:
                    vertex = board["vertices"][vid]
                    if vertex["owner"] == player_id and vertex["building"]:
                        player["resources"][hex_["resource"]] += 1

    elif card_name == "Militia":
        militia_target = target.get("target_player")
        if militia_target:
            state["turn"]["militia_target"] = militia_target

    elif is_structure:
        player["structures_in_play"].append({
            "card_id": card_id,
            "card_name": card_name,
            "attached_vertex": -1,
        })

    player["hand"] = [c for c in player["hand"] if c["id"] != card_id]
    if not is_structure:
        state["deck"]["discard_pile"].append(card_name)

    return state
