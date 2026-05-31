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