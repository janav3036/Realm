import random

def distribute_resources(state, dice_total):
    board = state["board"]
    players = state["players"]
    vertices = {v["id"]: v for v in board["vertices"]}

    for hex_ in board["hexes"]:
        if hex_["number"] != dice_total:
            continue
        if hex_["has_robber"]:
            continue

        for vid in hex_["adjacent_vertices"]:
            vertex = vertices[vid]
            if vertex["building"] is None:
                continue

            owner = vertex["owner"]
            resource = hex_["resource"]
            amount = 2 if vertex["building"] == "city" else 1
            players[owner]["resources"][resource] += amount
    
    return state

def handle_seven(state, active_player_id):
    #Find player who have more than 7 resources
    must_discard = []
    for pid, player in state["players"].items():
        total = sum(player["resources"].values())
        if total > 7:
            must_discard.append(pid)

    state["turn"]["phase"] = "discard" if must_discard else "robber"
    state["turn"]["must_discard"] = must_discard

    return state

def can_place_settlement(state, vertex_id, player_id, setup=False):
    board = state["board"]
    vertex = board["vertices"][vertex_id]
    player = state["players"][player_id]

    if vertex["building"] is not None:
        return False, "Vertex is already occupied"
    
    for adj_vid in vertex["adjacent_vertices"]:
        if board["vertices"][adj_vid]["building"] is not None:
            return False, "Too close to another building"
        
    if not setup:
        player_edges = set(player["buildings"]["roads"])
        connected = any(
            edge["id"] in player_edges
            for edge in board["edges"]
            if vertex_id in edge["vertices"]
        )
        if not connected:
            return False, "No road connection"
        
        cost = {"timber": 1, "stone": 1, "grain": 1, "wool": 1}
        for resource, amount in cost.items():
            if player["resources"][resource] < amount:
                return False, "Insufficient resources"
        
    return True, "" 

def can_place_road(state, edge_id, player_id):
    board = state["board"]
    player = state["players"][player_id]
    edge = board["edges"][edge_id]

    # Check 1: edge must be empty
    if edge["road"] is not None:
        return False, "Edge already has a road"

    # Check 2: must connect to player's network
    # A vertex on this edge counts as connected if:
    # - the player owns a building there, OR
    # - one of the player's roads touches that vertex
    player_roads = set(player["buildings"]["roads"])
    player_settlements = set(player["buildings"]["settlements"] + player["buildings"]["cities"])
    connected = False
    for vid in edge["vertices"]:
        vertex = board["vertices"][vid]
        if vid in player_settlements:
            connected = True
            break
        for adj_eid in vertex["adjacent_edges"]:
            if adj_eid in player_roads:
                connected = True
                break
    if not connected:
        return False, "No network connection"

    # Check 3: resources
    if player["resources"]["timber"] < 1 or player["resources"]["stone"] < 1:
        return False, "Insufficient resources"

    return True, ""

def can_upgrade_city(state, vertex_id, player_id):
    board = state["board"]
    vertex = board["vertices"][vertex_id]
    player= state["players"][player_id]

    if vertex["building"] != "settlement" or vertex["owner"] != player_id:
        return False, "Not owned"
    
    if player["resources"]["ore"] < 3 or player["resources"]["grain"] < 2:
        return False, "Insufficient resources"
    
    return True, ""
        
def place_settlement(state, vertex_id, player_id):
    board = state["board"]
    vertex = board["vertices"][vertex_id]
    player= state["players"][player_id]

    vertex["building"] = "settlement"
    vertex["owner"] = player_id
    player["buildings"]["settlements"].append(vertex_id)
    player["pieces_remaining"]["settlements"] -= 1
    player["victory_points"] += 1

    return state

def place_road(state, edge_id, player_id):
    board = state["board"]
    edge = board["edges"][edge_id]
    player= state["players"][player_id]

    edge["road"] = player_id
    player["buildings"]["roads"].append(edge_id)
    player["pieces_remaining"]["roads"] -= 1
    
    return state

def upgrade_city(state, vertex_id, player_id):
    board = state["board"]
    vertex = board["vertices"][vertex_id]
    player= state["players"][player_id]

    vertex["building"] = "city"
    player["buildings"]["cities"].append(vertex_id)
    player["buildings"]["settlements"].remove(vertex_id)
    player["pieces_remaining"]["cities"] -= 1
    player["pieces_remaining"]["settlements"] += 1
    player["victory_points"] += 1

    return state

def deduct_building_cost(state, player_id, building_type):
    costs = {
        "road":       {"timber": 1, "stone": 1},
        "settlement": {"timber": 1, "stone": 1, "grain": 1, "wool": 1},
        "city":       {"ore": 3, "grain": 2},
    }

    player = state["players"][player_id]
    for resource, amount in costs[building_type].items():
        player["resources"][resource] -= amount

    return state

def move_robber(state, hex_id, stealing_from, active_player):
    board = state["board"]

    # Move the robber
    board["hexes"][state["robber_hex"]]["has_robber"] = False
    board["hexes"][hex_id]["has_robber"] = True
    state["robber_hex"] = hex_id

    # Steal a random resource
    if stealing_from is not None:
        target = state["players"][stealing_from]
        resource_pool = []
        for resource, amount in target["resources"].items():
            resource_pool.extend([resource] * amount)

        if resource_pool:
            stolen = random.choice(resource_pool)
            target["resources"][stolen] -= 1
            state["players"][active_player]["resources"][stolen] += 1

    state["turn"]["phase"] = "action"
    return state

def get_player_port_rates(state, player_id):
    board = state["board"]
    player = state["players"][player_id]

    rates = {"timber": 4, "stone": 4, "grain": 4, "wool": 4, "ore": 4}
    
    all_buildings = player["buildings"]["settlements"] + player["buildings"]["cities"]
    for vid in all_buildings:
        port = board["vertices"][vid]["port"]
        if port is None:
            continue
        if port == "3:1":
            for resource in rates:
                if rates[resource] > 3:
                    rates[resource] = 3
        else:
            if rates[port] > 2:
                rates[port] = 2

    return rates

def validate_player_trade(state, from_id, to_id, offering: dict, requesting: dict):
    from_player = state["players"][from_id]
    to_player = state["players"][to_id]
    
    if not offering or not requesting:
        return False, "Cannot offer or request nothing"
    
    for resource, amount in offering.items():
        if from_player["resources"][resource] < amount:
            return False, "Insufficient resources"
        
    for resource, amount in requesting.items():
        if to_player["resources"][resource] < amount:
            return False, "Opposing player has insufficient resources"
        
    return True, "Valid Trade"

def execute_player_trade(state, from_id, to_id, offering: dict, requesting: dict):
    from_player = state["players"][from_id]
    to_player = state["players"][to_id]

    for resource, amount in offering.items():
        from_player["resources"][resource] -= amount
        to_player["resources"][resource] += amount

    for resource, amount in requesting.items():
        to_player["resources"][resource] -= amount
        from_player["resources"][resource] += amount

    return state

def execute_bank_trade(state, player_id, giving, receiving):
    if not giving or not receiving:
        return False, state, "Cannot trade nothing"

    player = state["players"][player_id]
    rates = get_player_port_rates(state, player_id)

    # Check player has what they're giving
    for resource, amount in giving.items():
        if player["resources"][resource] < amount:
            return False, state, "Insufficient resources"

    # Check trade rates are satisfied
    total_owed = sum(amount // rates[resource] for resource, amount in giving.items())
    total_receiving = sum(receiving.values())
    if total_owed != total_receiving:
        return False, state, "Trade rate not satisfied"

    # Execute
    for resource, amount in giving.items():
        player["resources"][resource] -= amount
    for resource, amount in receiving.items():
        player["resources"][resource] += amount

    return True, state, ""


def calculate_longest_road(state, player_id):
    board = state["board"]
    player = state["players"][player_id]
    player_roads = set(player["buildings"]["roads"])

    # Build adjacency: edge_id -> list of connected edge_ids (via shared vertex)
    # Two roads are connected if they share a vertex not blocked by an opponent
    def get_connected_edges(edge_id, visited_edges):
        edge = board["edges"][edge_id]
        connected = []
        for vid in edge["vertices"]:
            vertex = board["vertices"][vid]
            # Blocked if opponent has a building here
            if vertex["owner"] is not None and vertex["owner"] != player_id:
                continue
            for adj_eid in vertex["adjacent_edges"]:
                if adj_eid in player_roads and adj_eid not in visited_edges:
                    connected.append(adj_eid)
        return connected

    def dfs(edge_id, visited):
        visited.add(edge_id)
        best = len(visited)
        for next_edge in get_connected_edges(edge_id, visited):
            best = max(best, dfs(next_edge, visited))
        visited.remove(edge_id)
        return best

    longest = 0
    for edge_id in player_roads:
        longest = max(longest, dfs(edge_id, set()))

    return longest

def update_longest_road_award(state):
    longest_by_player = {}
    for player_id in state["players"]:
        length  = calculate_longest_road(state, player_id)
        state["players"][player_id]["longest_road_length"] = length
        longest_by_player[player_id] = length

    current_holder = state["longest_road_owner"]
    best_id = max(longest_by_player, key=lambda pid: longest_by_player[pid])
    best_length = longest_by_player[best_id]

    if best_length < 5:
        state["longest_road_owner"] = None
    elif current_holder is None:
        if best_length >= 5:
            state["longest_road_owner"] = best_id
    elif best_id != current_holder and best_length > longest_by_player[current_holder]:
        state["longest_road_owner"] = best_id

    return state

def update_largest_army_award(state):
    current_holder = state["largest_army_owner"]
    best_id = max(state["players"], key=lambda pid: state["players"][pid]["sabotage_cards_played"])
    best_count = state["players"][best_id]["sabotage_cards_played"]

    if best_count < 3:
        state["largest_army_owner"] = None
    elif current_holder is None:
        if best_count >= 3:
            state["largest_army_owner"] = best_id
    elif best_id != current_holder and best_count > state["players"][current_holder]["sabotage_cards_played"]:
        state["largest_army_owner"] = best_id

    return state


def calculate_vp(state, player_id):
    player = state["players"][player_id]

    total = player["victory_points"]
    total += player["vp_cards"]

    if state["longest_road_owner"] == player_id:
        total += 2
    if state["largest_army_owner"] == player_id:
        total += 2

    return total

def check_win_condition(state):
    for player_id in state["players"]:
        if calculate_vp(state, player_id) >= 10:
            return player_id
    return None


def advance_turn(state):
    order = state["player_order"]
    current = state["turn"]["current_player"]
    next_index = (order.index(current) + 1) % len(order)

    state["turn"]["current_player"] = order[next_index]
    state["turn"]["turn_number"] += 1
    state["turn"]["rolled"] = False
    state["turn"]["dice"] = None
    state["turn"]["dice_total"] = None
    state["turn"]["phase"] = "draw"
    state["turn"]["active_trade"] = None

    return state


def get_next_setup_player(state):
    turn = state["turn"]
    order = turn["setup_order"]
    current = turn["current_player"]
    current_index = order.index(current)

    if turn["setup_round"] == 1:
        if current_index + 1 < len(order):
            return order[current_index + 1]
        else:
            # End of round 1, start round 2 in reverse
            turn["setup_round"] = 2
            return order[-1]
    else:
        if current_index - 1 >= 0:
            return order[current_index - 1]
        else:
            # Setup complete
            return None
