import random
import string
import time

rooms = {}

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase, k=4))

def create_room(player_id, player_name, socket_id):
    code = generate_room_code()
    while code in rooms:
        code = generate_room_code()
    
    rooms[code] = {
        "game_state": None,
        "status": "lobby",
        "created_at": time.time(),
        "host_player_id": player_id,
        "player_count": 1,
        "players": {
            player_id: {"name": player_name, "socket_id": socket_id}
        }
    }
    return code

def get_room(room_code):
    return rooms.get(room_code)

def add_player_to_room(room_code, player_id, player_name, socket_id):
    room = rooms.get(room_code)
    if not room:
        return False, "Room not found"
    if room["status"] != "lobby":
        return False, "Game already started"
    
    if room["player_count"] >= 4:
        return False, "Room is full"
    room["players"][player_id] = {"name": player_name, "socket_id": socket_id}
    room["player_count"] += 1
    return True, ""

def remove_player(room_code, player_id):
    room = rooms.get(room_code)
    if not room: 
        return
    room["players"].pop(player_id, None)
    room["player_count"] = max(0, room["player_count"] - 1)
    if room["player_count"] == 0:
        del rooms[room_code]

def get_room_by_socket(socket_id):
    for code, room in rooms.items():
        for pid, pdata in room["players"].items():
            if pdata["socket_id"] == socket_id:
                return code, pid
    return None, None