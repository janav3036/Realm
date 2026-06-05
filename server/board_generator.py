import math
import random
from itertools import combinations

# 19 hex positions in axial coordinates (q, r)
HEX_POSITIONS = [
    (0, -2), (1, -2), (2, -2),
    (-1, -1), (0, -1), (1, -1), (2, -1),
    (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0),
    (-2, 1), (-1, 1), (0, 1), (1, 1),
    (-2, 2), (-1, 2), (0, 2)
]

RESOURCE_DISTRIBUTION = (
    ["timber"] * 4 +
    ["stone"] * 3 +
    ["grain"] * 4 +
    ["wool"] * 4 +
    ["ore"] * 3 +
    ["desert"]
)

NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

# Axial direction vectors for the 6 hex neighbors
HEX_DIRECTIONS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]

# Port assignments: (outer_vertex_pair_key, port_type)
# Ports sit on specific outer edges; each port touches 2 adjacent outer vertices.
PORT_DEFINITIONS = [
    {"type": "3:1",    "vertices": None},  # filled in programmatically
    {"type": "3:1",    "vertices": None},
    {"type": "3:1",    "vertices": None},
    {"type": "3:1",    "vertices": None},
    {"type": "timber", "vertices": None},
    {"type": "stone",  "vertices": None},
    {"type": "grain",  "vertices": None},
    {"type": "wool",   "vertices": None},
    {"type": "ore",    "vertices": None},
]


def hex_to_pixel(q, r, hex_size=1.0):
    x = hex_size * (math.sqrt(3) * q + math.sqrt(3) / 2 * r)
    y = hex_size * (3 / 2 * r)
    return x, y


def axial_neighbors(q, r):
    return [(q + dq, r + dr) for dq, dr in HEX_DIRECTIONS]


def _are_adjacent_hexes(hex_a, hex_b):
    qa, ra = hex_a["q"], hex_a["r"]
    qb, rb = hex_b["q"], hex_b["r"]
    return (qb - qa, rb - ra) in HEX_DIRECTIONS


def _shuffle_until_no_adjacent_68(hexes, resources, tokens):
    """
    Assign numbers to non-desert hexes, retrying until no 6/8 are adjacent.
    Returns list of (hex_index, number) assignments.
    """
    non_desert = [i for i, r in enumerate(resources) if r != "desert"]
    assert len(non_desert) == len(tokens)

    for _ in range(10000):
        shuffled = tokens[:]
        random.shuffle(shuffled)
        assignment = dict(zip(non_desert, shuffled))

        bad = False
        for a, b in combinations(non_desert, 2):
            if assignment[a] in (6, 8) and assignment[b] in (6, 8):
                if _are_adjacent_hexes(hexes[a], hexes[b]):
                    bad = True
                    break
        if not bad:
            return assignment

    raise RuntimeError("Could not place number tokens without adjacent 6/8 after 10000 tries")


def _vertex_key(corners):
    """Canonical key for a set of corner (q,r) axial positions."""
    return tuple(sorted(corners))


def _hex_corners_axial(q, r):
    """
    Return the 6 corner identifiers for hex (q,r).
    Each corner is identified by the frozenset of up-to-3 hex axial coords that share it.
    We use fractional axial offsets to compute corner positions precisely.
    """
    # Flat-top hex: 6 corners are shared between this hex and its neighbors.
    # Corner i is shared between hex (q,r) and its neighbors at direction i and i-1.
    corners = []
    for i in range(6):
        d0 = HEX_DIRECTIONS[i]
        d1 = HEX_DIRECTIONS[(i + 1) % 6]
        n0 = (q + d0[0], r + d0[1])
        n1 = (q + d1[0], r + d1[1])
        corners.append(frozenset([(q, r), n0, n1]))
    return corners


def _hex_edges_axial(q, r):
    """
    Return the 6 edge identifiers for hex (q,r).
    Each edge is shared between this hex and one neighbor.
    Edge i is between hex (q,r) and neighbor in direction i,
    identified by the frozenset of the two hex coords.
    """
    edges = []
    for dq, dr in HEX_DIRECTIONS:
        neighbor = (q + dq, r + dr)
        edges.append(frozenset([(q, r), neighbor]))
    return edges


def build_adjacency_maps(hexes):
    """
    Derive all 54 vertices and 72 edges from the hex grid.
    Returns (vertices, edges) as lists matching the game_state schema.
    """
    hex_pos_set = {(h["q"], h["r"]) for h in hexes}
    hex_id_map = {(h["q"], h["r"]): h["id"] for h in hexes}

    # --- collect unique vertices ---
    vertex_map = {}  # frozenset_key -> vertex_id
    vertex_hex_adj = {}  # vertex_id -> [hex_id]
    next_vid = 0

    vertex_corner_info = {}  # vid -> (q, r, corner_index)

    for h in hexes:
        q, r = h["q"], h["r"]
        for i, corner_set in enumerate(_hex_corners_axial(q, r)):
            key = corner_set
            if key not in vertex_map:
                vertex_map[key] = next_vid
                vertex_hex_adj[next_vid] = []
                vertex_corner_info[next_vid] = (q, r, i)
                next_vid += 1
            vid = vertex_map[key]
            vertex_hex_adj[vid].append(h["id"])

    # --- collect unique edges ---
    edge_map = {}   # frozenset_key -> edge_id
    edge_vertices = {}  # edge_id -> (vid_a, vid_b)
    next_eid = 0

    # An edge connects two vertices that are adjacent corners of the same hex.
    for h in hexes:
        q, r = h["q"], h["r"]
        corners = _hex_corners_axial(q, r)
        for i in range(6):
            c_a = corners[i]
            c_b = corners[(i + 1) % 6]
            edge_key = frozenset([c_a, c_b])
            if edge_key not in edge_map:
                edge_map[edge_key] = next_eid
                va = vertex_map[c_a]
                vb = vertex_map[c_b]
                edge_vertices[next_eid] = (va, vb)
                next_eid += 1

    # --- build vertex adjacency (adjacent vertices share an edge) ---
    vertex_adj_vertices = {vid: [] for vid in range(next_vid)}
    vertex_adj_edges = {vid: [] for vid in range(next_vid)}
    for eid, (va, vb) in edge_vertices.items():
        vertex_adj_vertices[va].append(vb)
        vertex_adj_vertices[vb].append(va)
        vertex_adj_edges[va].append(eid)
        vertex_adj_edges[vb].append(eid)

    # --- compute pixel positions for each vertex ---
    # Average pixel positions of the 1-3 hexes that share the vertex.
    hex_size = 80
    vertex_pixels = {}
    for vid, (q, r, i) in vertex_corner_info.items():
        hx, hy = hex_to_pixel(q, r, hex_size)
        angle = -math.pi / 3 * i - math.pi / 6
        vertex_pixels[vid] = (
            hx + hex_size * math.cos(angle),
            hy + hex_size * math.sin(angle)
        )


    # --- identify outer vertices (touching at least one non-board hex) ---
    def is_outer(corner_set):
        return any(c not in hex_pos_set for c in corner_set)

    outer_vertices = {vertex_map[cs] for cs in vertex_map if is_outer(cs)}

    # --- assign ports to outer vertex pairs ---
    # Find outer edges (edges where at least one endpoint vertex is outer and
    # the edge is on the board boundary).
    outer_edge_pairs = []
    for eid, (va, vb) in edge_vertices.items():
        if va in outer_vertices and vb in outer_vertices:
            # Check they share a board hex
            shared_hexes = set(vertex_hex_adj[va]) & set(vertex_hex_adj[vb])
            if len(shared_hexes) == 1:
                outer_edge_pairs.append((va, vb))

    random.shuffle(outer_edge_pairs)
    port_vertex_map = {}  # vertex_id -> port_type

    port_types = ["3:1", "3:1", "3:1", "3:1", "timber", "stone", "grain", "wool", "ore"]
    random.shuffle(port_types)

    used_vertices = set()
    assigned = 0
    for va, vb in outer_edge_pairs:
        if assigned >= len(port_types):
            break
        if va in used_vertices or vb in used_vertices:
            continue
        port_vertex_map[va] = port_types[assigned]
        port_vertex_map[vb] = port_types[assigned]
        used_vertices.add(va)
        used_vertices.add(vb)
        assigned += 1

    # --- build final vertex list ---
    vertices = []
    for vid in range(next_vid):
        px, py = vertex_pixels[vid]
        vertices.append({
            "id": vid,
            "adjacent_hexes": vertex_hex_adj[vid],
            "adjacent_edges": vertex_adj_edges[vid],
            "adjacent_vertices": vertex_adj_vertices[vid],
            "building": None,
            "owner": None,
            "port": port_vertex_map.get(vid),
            "pixel_x": round(px, 2),
            "pixel_y": round(py, 2),
        })

    # --- build final edge list ---
    edges = []
    for eid in range(next_eid):
        va, vb = edge_vertices[eid]
        edges.append({
            "id": eid,
            "vertices": [va, vb],
            "road": None,
        })

    return vertices, edges


def generate_board():
    """
    Generate a fully randomized Catan board.
    Returns the board dict with hexes, vertices, edges.
    """
    resources = RESOURCE_DISTRIBUTION[:]
    random.shuffle(resources)

    hexes = []
    for idx, (q, r) in enumerate(HEX_POSITIONS):
        hexes.append({
            "id": idx,
            "q": q,
            "r": r,
            "resource": resources[idx],
            "number": None,
            "has_robber": resources[idx] == "desert",
        })

    token_assignment = _shuffle_until_no_adjacent_68(hexes, resources, NUMBER_TOKENS[:])
    for idx, number in token_assignment.items():
        hexes[idx]["number"] = number

    vertices, edges = build_adjacency_maps(hexes)
    # Build a reverse map: hex_id -> [vertex_ids]
    for h in hexes:
        h["adjacent_vertices"] = [
            v["id"] for v in vertices if h["id"] in v["adjacent_hexes"]
        ]


    return {
        "hexes": hexes,
        "vertices": vertices,
        "edges": edges,
    }


def get_hex_vertices(hex_id, vertices):
    return [v["id"] for v in vertices if hex_id in v["adjacent_hexes"]]


def get_vertex_hexes(vertex_id, vertices):
    return vertices[vertex_id]["adjacent_hexes"]
