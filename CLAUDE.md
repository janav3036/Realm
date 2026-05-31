# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# REALM — Complete Project Specification

> Catan-inspired multiplayer strategy game with cards, hex board, and real-time WebSocket multiplayer.
> Cross-platform: browser, Windows (.exe), Mac (.app), Android (.apk), iOS (PWA).
> This document is the single source of truth. Read it fully before writing any code.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Game Design](#4-game-design)
5. [Data Models](#5-data-models)
6. [WebSocket Protocol](#6-websocket-protocol)
7. [Game Logic — Function Signatures](#7-game-logic--function-signatures)
8. [Server Architecture](#8-server-architecture)
9. [Client Architecture](#9-client-architecture)
10. [Card System](#10-card-system)
11. [Platform Wrappers](#11-platform-wrappers)
12. [Deployment](#12-deployment)
13. [Testing Approach](#13-testing-approach)
14. [Build Phases](#14-build-phases)
15. [Key Constraints](#15-key-constraints)

---

## 1. Project Overview

**Game name:** Realm (working title)
**Players:** 2–4
**Goal:** First player to 10 Victory Points wins
**Core loop:** Roll dice → collect resources → play cards → trade → build → repeat
**Unique addition over standard Catan:** Cards are a core mechanic drawn every turn, not a side system

**What makes this different from Catan:**
- Players draw 1 card at the start of every turn (hand is always active)
- Three card types: Action (one-time), Structure (permanent buffs), Event (global effects)
- No mandatory separate development card purchase — cards are drawn freely
- Event cards resolve immediately when drawn, affecting all players

---

## 2. Tech Stack

### Backend
```
Python 3.11+
Flask 3.x
Flask-SocketIO 5.x
eventlet 0.36+          ← required for WebSocket support with gunicorn
gunicorn 21.x
```

### Frontend
```
Phaser 3.60.0           ← game rendering (canvas-based)
Socket.IO client 4.x    ← must match Flask-SocketIO 5.x
Vanilla JS (ES6+)       ← no framework, keep it lean
HTML5 / CSS3
```

### Platform Wrappers
```
Electron 30.x           ← Windows .exe + Mac .app
Capacitor 6.x           ← Android .apk + iOS .ipa
```

### Dev Tools
```
ngrok                   ← local tunnel for development testing
Python venv             ← isolate server dependencies
npm                     ← manage JS dependencies and Electron/Capacitor
```

### Production Hosting
```
Google Cloud e2-micro   ← always-free VM (us-central1)
nginx                   ← reverse proxy, SSL termination
certbot (Let's Encrypt) ← SSL certificates
systemd                 ← process management
```

### Install Commands
```bash
# Server
pip install flask flask-socketio eventlet gunicorn

# Client (in client/ directory)
npm install phaser socket.io-client

# Electron (in electron/ directory)
npm install electron electron-builder

# Capacitor (in root)
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
```

---

## 3. Project Structure

```
realm/
├── server/
│   ├── app.py                  # Flask app, SocketIO handlers, entry point
│   ├── game_logic.py           # All game rules, state mutations, validation
│   ├── board_generator.py      # Hex board generation, adjacency maps
│   ├── card_system.py          # Card deck, draw logic, card effect resolvers
│   ├── room_manager.py         # Room creation, player sessions, cleanup
│   ├── requirements.txt
│   └── tests/
│       ├── test_board.py
│       ├── test_game_logic.py
│       └── test_cards.py
│
├── client/
│   ├── index.html              # Entry point
│   ├── package.json
│   ├── src/
│   │   ├── main.js             # Phaser game config, scene registry
│   │   ├── network.js          # Socket.IO wrapper, event emitters
│   │   ├── scenes/
│   │   │   ├── BootScene.js    # Preload assets
│   │   │   ├── LobbyScene.js   # Room creation/joining, player list
│   │   │   ├── GameScene.js    # Main game board rendering
│   │   │   ├── UIScene.js      # HUD, resources, cards, actions (overlays GameScene)
│   │   │   └── EndScene.js     # Win screen, play again
│   │   ├── objects/
│   │   │   ├── HexBoard.js     # Hex tile rendering, number tokens, robber
│   │   │   ├── Vertex.js       # Settlement/city rendering, click handlers
│   │   │   ├── Edge.js         # Road rendering, click handlers
│   │   │   ├── CardHand.js     # Player's card hand UI
│   │   │   └── PlayerPanel.js  # Resource counts, VP, player info
│   │   └── utils/
│   │       ├── HexMath.js      # Axial coordinate conversions, pixel positions
│   │       └── Constants.js    # Colors, sizes, resource types, building costs
│   └── assets/
│       ├── tiles/              # Hex tile images per resource type
│       ├── cards/              # Card artwork
│       ├── ui/                 # Buttons, panels, icons
│       └── sounds/             # Dice roll, build, card play SFX
│
├── electron/
│   ├── main.js                 # Electron entry point
│   └── package.json
│
├── capacitor.config.json       # Mobile wrapper config
└── README.md
```

---

## 4. Game Design

### 4.1 The Board

A hex grid of **19 tiles** randomly arranged each game. Standard Catan topology — do not change the shape, only the resource/number assignments are randomized.

**Resource distribution:**
```
Forest    → Timber    → 4 tiles
Hills     → Stone     → 3 tiles
Fields    → Grain     → 4 tiles
Pasture   → Wool      → 4 tiles
Mountains → Ore       → 3 tiles
Desert    → Nothing   → 1 tile  (robber starts here)
```

**Number tokens placed on non-desert tiles:**
```
Token 2  → 1 tile
Token 3  → 2 tiles
Token 4  → 2 tiles
Token 5  → 2 tiles
Token 6  → 2 tiles
Token 8  → 2 tiles
Token 9  → 2 tiles
Token 10 → 2 tiles
Token 11 → 2 tiles
Token 12 → 1 tile
```
Note: No 6 and 8 tokens should be adjacent (high probability tiles). Enforce this during generation.

**Board positions:**
```
54 vertices  → where settlements and cities are placed
72 edges     → where roads are built
19 hexes     → resource tiles
```

**Ports (on outer edges of the board):**
```
3:1 Generic port  → 4 ports (trade any 3 identical for 1 of any)
2:1 Timber port   → 1 port
2:1 Stone port    → 1 port
2:1 Grain port    → 1 port
2:1 Wool port     → 1 port
2:1 Ore port      → 1 port
```

Ports are attached to specific outer edge vertices. Players with a settlement on a port vertex get that trade rate.

### 4.2 Hex Coordinate System

Use **axial coordinates (q, r)** for all hex positions.

```python
# The 19 hex positions in axial coordinates
HEX_POSITIONS = [
    (0, -2), (1, -2), (2, -2),
    (-1, -1), (0, -1), (1, -1), (2, -1),
    (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0),
    (-2, 1), (-1, 1), (0, 1), (1, 1),
    (-2, 2), (-1, 2), (0, 2)
]

# Convert axial → pixel (flat-top hexagons)
def hex_to_pixel(q, r, hex_size):
    x = hex_size * (3/2 * q)
    y = hex_size * (math.sqrt(3)/2 * q + math.sqrt(3) * r)
    return x, y
```

### 4.3 Setup Phase

Before the main game begins:

1. Board generates randomly
2. Turn order determined (random or by agreement)
3. **Round 1:** Each player places 1 settlement and 1 road, in turn order
4. **Round 2:** Each player places 1 settlement and 1 road, in **reverse** turn order
5. After Round 2, each player collects resources for every hex touching their second settlement
6. Each player draws 4 cards
7. Main game begins with Player 1

### 4.4 Turn Structure

Every turn in strict sequence:

```
1. DRAW       → Draw 1 card from the shared deck
2. ROLL       → Roll 2d6. Distribute resources. Handle 7.
3. CARDS      → Optionally play any number of cards from hand
4. TRADE      → Optionally trade with players or bank
5. BUILD      → Optionally build roads, settlements, cities
6. END TURN   → Pass to next player clockwise
```

Steps 3, 4, 5 can happen in any order and can interleave (e.g. play a card, then trade, then play another card, then build).

### 4.5 Dice Roll Resolution

```
Roll total → find all hexes with matching number token
           → skip hexes with the robber on them
           → for each matching hex:
               → find all vertices touching that hex
               → for each vertex with a building:
                   → settlement: owner gets 1 of that resource
                   → city:       owner gets 2 of that resource
```

**Rolling 7:**
```
1. Any player holding > 7 resource cards must discard half (rounded down)
2. Active player moves robber to any hex (cannot stay on current hex)
3. Active player steals 1 random resource card from any player
   with a settlement/city touching the new robber hex
   (active player's choice of which player to steal from if multiple)
```

### 4.6 Building Rules and Costs

```
ROAD
  Cost:       1 Timber + 1 Stone
  Placement:  Must connect to own road, settlement, or city
  Limit:      15 roads per player

SETTLEMENT
  Cost:       1 Timber + 1 Stone + 1 Grain + 1 Wool
  Placement:  On any unoccupied vertex
              No adjacent vertex may have any building (distance rule)
              Must connect to own road network (except during setup)
  Limit:      5 settlements per player

CITY
  Cost:       3 Ore + 2 Grain
  Placement:  Replaces one of your existing settlements
  Effect:     Produces 2 resources instead of 1 when its number rolls
  Limit:      4 cities per player

EXTRA CARD DRAW
  Cost:       1 Ore + 1 Grain + 1 Wool
  Effect:     Draw 1 additional card immediately
  No limit
```

### 4.7 Trading Rules

**Player-to-player trade:**
- Active player may propose a trade to any other player
- Offer: any combination of resources and/or cards
- Request: any combination of resources and/or cards
- Other player may accept, reject, or counter-offer
- Only one trade per direction per turn (active player can trade with multiple people)
- Non-active players cannot trade with each other

**Bank trade:**
- Default rate: 4:1 (any 4 identical resources → 1 of any resource)
- 3:1 port vertex: 3:1 for any resource
- 2:1 port vertex: 2:1 for that specific resource only

### 4.8 Victory Points

```
Settlement placed          +1 VP
Settlement upgraded to city +1 VP (net +1, city = 2 VP total)
Longest Road               +2 VP (minimum 5 connected roads, stolen if another player surpasses)
Largest Army               +2 VP (minimum 3 Sabotage cards played, stolen if surpassed)
Victory Point card (held)  +1 VP each
```

**Win condition:** Reach exactly 10 VP on your turn. Check after every build or card play. You may win mid-turn. Announce immediately and game ends.

VP cards are secret — kept in hand, only revealed when winning. All other VP sources are public.

---

## 5. Data Models

### 5.1 Complete Game State

This is the single authoritative object. Lives on the server. Never modified directly by clients.

```python
game_state = {

    # ── BOARD ──────────────────────────────────────────────────────
    "board": {
        "hexes": [
            {
                "id": int,              # 0–18
                "q": int,               # axial coordinate
                "r": int,               # axial coordinate
                "resource": str,        # "timber"|"stone"|"grain"|"wool"|"ore"|"desert"
                "number": int | None,   # 2–12, None for desert
                "has_robber": bool
            }
            # × 19
        ],
        "vertices": [
            {
                "id": int,              # 0–53
                "adjacent_hexes": [int],    # 1–3 hex ids
                "adjacent_edges": [int],    # 2–3 edge ids
                "adjacent_vertices": [int], # 2–3 vertex ids (for distance rule)
                "building": str | None,     # None | "settlement" | "city"
                "owner": str | None,        # player_id or None
                "port": str | None          # None | "3:1" | "timber" | "stone" | "grain" | "wool" | "ore"
            }
            # × 54
        ],
        "edges": [
            {
                "id": int,              # 0–71
                "vertices": [int, int], # the two vertex ids this edge connects
                "road": str | None      # player_id or None
            }
            # × 72
        ]
    },

    # ── PLAYERS ────────────────────────────────────────────────────
    "players": {
        "player_id": {
            "id": str,
            "name": str,
            "color": str,               # "red"|"blue"|"green"|"orange"
            "resources": {
                "timber": int,
                "stone": int,
                "grain": int,
                "wool": int,
                "ore": int
            },
            "hand": [                   # cards currently in hand
                {
                    "id": str,          # unique card instance id
                    "type": str,        # "action"|"structure"|"event"|"vp"
                    "name": str,        # card name e.g. "Harvest"
                }
            ],
            "structures_in_play": [     # structure cards attached to board
                {
                    "card_id": str,
                    "card_name": str,
                    "attached_vertex": int  # vertex id
                }
            ],
            "buildings": {
                "settlements": [int],   # vertex ids
                "cities": [int],        # vertex ids
                "roads": [int]          # edge ids
            },
            "pieces_remaining": {
                "settlements": int,     # starts at 5
                "cities": int,          # starts at 4
                "roads": int            # starts at 15
            },
            "victory_points": int,      # public VP only (excludes VP cards)
            "vp_cards": int,            # count of VP cards in hand (secret until win)
            "sabotage_cards_played": int,  # for Largest Army tracking
            "longest_road_length": int,    # cached, recalculate on road/settlement change
            "connected": bool,
            "socket_id": str
        }
    },

    # ── TURN ───────────────────────────────────────────────────────
    "turn": {
        "current_player": str,      # player_id
        "phase": str,               # "setup_s1"|"setup_s2"|"draw"|"roll"|"action"|"end"
        "setup_round": int,         # 1 or 2
        "setup_order": [str],       # player ids in setup placement order
        "dice": [int, int] | None,  # e.g. [4, 3]
        "dice_total": int | None,
        "rolled": bool,
        "turn_number": int,
        "active_trade": {           # None or pending trade proposal
            "from_player": str,
            "to_player": str,
            "offering": dict,       # {resource: amount, ...}
            "requesting": dict,
            "status": str           # "pending"|"accepted"|"rejected"
        } | None
    },

    # ── SPECIAL STATES ─────────────────────────────────────────────
    "robber_hex": int,              # hex id
    "longest_road_owner": str | None,
    "largest_army_owner": str | None,

    # ── CARD DECK ──────────────────────────────────────────────────
    "deck": {
        "draw_pile": [str],         # card names, shuffled
        "discard_pile": [str]
    },

    # ── META ───────────────────────────────────────────────────────
    "player_order": [str],          # clockwise order
    "winner": str | None,
    "game_log": [                   # append-only event log
        {
            "turn": int,
            "player": str,
            "event": str,
            "timestamp": float
        }
    ]
}
```

### 5.2 Room State (server-side only)

```python
rooms = {
    "ROOM_CODE": {
        "game_state": dict,         # full game_state object above
        "status": str,              # "lobby"|"setup"|"playing"|"ended"
        "created_at": float,
        "host_player_id": str,
        "player_count": int         # 2–4
    }
}
```

---

## 6. WebSocket Protocol

All events use Socket.IO. Server is always authoritative. Clients never modify game state directly.

### 6.1 Client → Server Events

```
create_room
  payload:  { player_name: str }
  response: room_created | error

join_room
  payload:  { room_code: str, player_name: str }
  response: state_update (broadcast to room) | error

start_game
  payload:  { room_code: str }
  response: state_update (broadcast) | error
  note:     host only, requires 2–4 players

action
  payload:  { room_code: str, player_id: str, action: ActionObject }
  response: state_update (broadcast) | error

chat
  payload:  { room_code: str, player_id: str, message: str }
  response: chat_message (broadcast)
```

**ActionObject — all valid action types:**

```javascript
// Roll dice
{ type: "roll_dice" }

// Place building (setup phase)
{ type: "place_setup_settlement", vertex_id: int }
{ type: "place_setup_road", edge_id: int }

// Build (main game)
{ type: "build_road", edge_id: int }
{ type: "build_settlement", vertex_id: int }
{ type: "build_city", vertex_id: int }

// Cards
{ type: "play_card", card_id: str, target_player: str | null, target_vertex: int | null, target_hex: int | null }
{ type: "buy_extra_card" }

// Robber
{ type: "move_robber", hex_id: int, steal_from: str | null }

// Trading
{ type: "propose_trade", to_player: str, offering: {resource: amount}, requesting: {resource: amount} }
{ type: "respond_trade", accept: bool }
{ type: "bank_trade", giving: {resource: int}, receiving: {resource: int} }

// Discard (on 7 roll)
{ type: "discard_resources", resources: {resource: amount} }

// Turn
{ type: "end_turn" }
```

### 6.2 Server → Client Events

```
room_created
  payload:  { room_code: str, player_id: str }

state_update
  payload:  full game_state object
  note:     sent to entire room on any state change

error
  payload:  { code: str, message: str }

chat_message
  payload:  { player_name: str, message: str, timestamp: float }

player_disconnected
  payload:  { player_id: str, player_name: str }
```

---

## 7. Game Logic — Function Signatures

All live in `server/game_logic.py`. Server calls these — never client.

```python
# ── BOARD GENERATION ───────────────────────────────────────────────
def generate_board() -> dict:
    """Generate a randomized Catan board. Returns full board object with hexes,
    vertices, and edges. Enforce no adjacent 6/8 tokens. Assign ports."""

def build_adjacency_maps(hexes: list) -> tuple[list, list]:
    """From hex positions, derive all 54 vertices and 72 edges with their
    adjacency data. Returns (vertices, edges)."""

def get_hex_vertices(hex_id: int, vertices: list) -> list[int]:
    """Return list of vertex ids adjacent to a given hex."""

def get_vertex_hexes(vertex_id: int, vertices: list) -> list[int]:
    """Return list of hex ids adjacent to a given vertex."""


# ── RESOURCE DISTRIBUTION ──────────────────────────────────────────
def distribute_resources(state: dict, dice_total: int) -> dict:
    """Find all producing hexes, credit resources to owners. Return updated state."""

def handle_seven(state: dict, active_player_id: str) -> dict:
    """Mark state as waiting for: (1) discard from over-7 players,
    (2) robber placement, (3) steal selection."""


# ── VALIDATION ─────────────────────────────────────────────────────
def can_place_road(state: dict, edge_id: int, player_id: str) -> tuple[bool, str]:
    """Check: edge empty, connects to player network, player has resources.
    Returns (valid, reason_if_invalid)."""

def can_place_settlement(state: dict, vertex_id: int, player_id: str, setup: bool = False) -> tuple[bool, str]:
    """Check: vertex empty, distance rule satisfied, road connection (if not setup),
    player has resources (if not setup). Returns (valid, reason)."""

def can_upgrade_city(state: dict, vertex_id: int, player_id: str) -> tuple[bool, str]:
    """Check: vertex has player's settlement, player has resources."""

def can_play_card(state: dict, card_id: str, player_id: str, target: dict) -> tuple[bool, str]:
    """Check: card in player's hand, valid target for card type, correct game phase."""


# ── STATE MUTATIONS ────────────────────────────────────────────────
def place_road(state: dict, edge_id: int, player_id: str) -> dict:
def place_settlement(state: dict, vertex_id: int, player_id: str) -> dict:
def upgrade_city(state: dict, vertex_id: int, player_id: str) -> dict:
def move_robber(state: dict, hex_id: int, stealing_from: str | None, active_player: str) -> dict:
def deduct_building_cost(state: dict, player_id: str, building_type: str) -> dict:


# ── TRADING ────────────────────────────────────────────────────────
def validate_player_trade(state: dict, from_id: str, to_id: str, offering: dict, requesting: dict) -> tuple[bool, str]:
def execute_player_trade(state: dict, from_id: str, to_id: str, offering: dict, requesting: dict) -> dict:
def execute_bank_trade(state: dict, player_id: str, giving: dict, receiving: dict) -> tuple[bool, dict, str]:
def get_player_port_rates(state: dict, player_id: str) -> dict:
    """Return {resource: trade_rate} for all resources, accounting for player's port settlements."""


# ── SPECIAL RULES ──────────────────────────────────────────────────
def calculate_longest_road(state: dict, player_id: str) -> int:
    """DFS traversal of player's road network. Return length of longest
    continuous road. Settlements/cities of other players break continuity."""

def update_longest_road_award(state: dict) -> dict:
    """Recalculate all players' road lengths. Update longest_road_owner if
    a player surpasses current holder by at least 1 (minimum 5 to claim)."""

def update_largest_army_award(state: dict) -> dict:
    """Compare sabotage_cards_played for all players. Update largest_army_owner
    (minimum 3, must surpass current holder)."""


# ── VICTORY ────────────────────────────────────────────────────────
def calculate_vp(state: dict, player_id: str) -> int:
    """Sum all VP sources: settlements, cities, longest road, largest army,
    VP cards in hand. Return total."""

def check_win_condition(state: dict) -> str | None:
    """Return player_id if any player is at 10+ VP, else None."""


# ── TURN MANAGEMENT ────────────────────────────────────────────────
def advance_turn(state: dict) -> dict:
    """Move to next player in player_order. Reset turn state. Return updated state."""

def get_next_setup_player(state: dict) -> str | None:
    """During setup, return next player to place. Returns None when setup complete."""
```

---

## 8. Server Architecture

### 8.1 app.py Structure

```python
from flask import Flask
from flask_socketio import SocketIO, join_room, leave_room, emit
from game_logic import *
from board_generator import generate_board
from card_system import create_deck, draw_card, resolve_card
from room_manager import create_room, get_room, add_player_to_room

app = Flask(__name__)
app.config["SECRET_KEY"] = "replace-with-env-var"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# All SocketIO handlers go here
# Each handler: validate → mutate state → broadcast state_update

@socketio.on("action")
def handle_action(data):
    room_code = data["room_code"]
    player_id = data["player_id"]
    action = data["action"]
    room = get_room(room_code)
    if not room:
        emit("error", {"message": "Room not found"})
        return
    state = room["game_state"]
    result = process_action(state, player_id, action)
    if result["valid"]:
        emit("state_update", state, to=room_code)
    else:
        emit("error", {"message": result["reason"]})
```

### 8.2 Room Code Generation

```python
import random, string

def generate_room_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase, k=4))
    # e.g. "XKCD", "ZRPA"
```

### 8.3 Running the Server

```bash
# Development
python server/app.py

# Production (via systemd, using gunicorn + eventlet)
gunicorn --worker-class eventlet -w 1 --bind 127.0.0.1:5000 app:app
```

**Critical:** Flask-SocketIO requires exactly `-w 1` with eventlet. Multiple workers break WebSocket state sharing.

---

## 9. Client Architecture

### 9.1 Phaser Game Config

```javascript
// client/src/main.js
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import LobbyScene from './scenes/LobbyScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import EndScene from './scenes/EndScene.js';

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#1a1a2e',
    scene: [BootScene, LobbyScene, GameScene, UIScene, EndScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

const game = new Phaser.Game(config);
```

### 9.2 Scene Responsibilities

```
BootScene     → Preload all assets (tiles, cards, UI elements, sounds)
              → Establish Socket.IO connection
              → Transition to LobbyScene

LobbyScene    → Create room / join room UI
              → Display player list, ready states
              → Host clicks Start → emit start_game
              → On game start → transition to GameScene + UIScene

GameScene     → Render hex board (tiles, number tokens, ports)
              → Render roads, settlements, cities
              → Render robber
              → Handle click events on vertices and edges
              → On state_update → redraw changed elements only

UIScene       → Runs parallel to GameScene (Phaser parallel scenes)
              → Resource counter panel
              → Card hand display
              → Action buttons (Roll Dice, End Turn, Trade)
              → Turn indicator
              → Victory point scoreboard
              → Trade proposal modal

EndScene      → Winner announcement
              → Final scores
              → Play Again button
```

### 9.3 Network Module

```javascript
// client/src/network.js
import { io } from 'socket.io-client';

const SERVER_URL = 'https://your-domain.com'; // swap for localhost:5000 in dev

class Network {
    constructor() {
        this.socket = io(SERVER_URL);
        this.roomCode = null;
        this.playerId = null;
    }

    createRoom(playerName) {
        this.socket.emit('create_room', { player_name: playerName });
    }

    joinRoom(roomCode, playerName) {
        this.roomCode = roomCode;
        this.socket.emit('join_room', { room_code: roomCode, player_name: playerName });
    }

    sendAction(action) {
        this.socket.emit('action', {
            room_code: this.roomCode,
            player_id: this.playerId,
            action: action
        });
    }

    on(event, callback) {
        this.socket.on(event, callback);
    }
}

export default new Network(); // singleton
```

### 9.4 Hex Rendering

```javascript
// client/src/objects/HexBoard.js
const HEX_SIZE = 80;       // pixels, adjust for screen size
const RESOURCE_COLORS = {
    timber:  0x228b22,
    stone:   0x808080,
    grain:   0xffd700,
    wool:    0x90ee90,
    ore:     0x4a4a4a,
    desert:  0xd2b48c
};

function drawHex(graphics, cx, cy, size, color) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6; // pointy-top
        points.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
    }
    graphics.fillStyle(color, 1);
    graphics.fillPoints(points, true);
    graphics.lineStyle(2, 0x000000, 1);
    graphics.strokePoints(points, true);
}
```

### 9.5 State Sync Pattern

On every `state_update` event from the server, do a full redraw:

```javascript
network.on('state_update', (state) => {
    this.gameState = state;
    this.hexBoard.render(state.board);
    this.uiScene.updateResources(state.players[this.myPlayerId]);
    this.uiScene.updateTurnIndicator(state.turn);
    this.uiScene.updateScoreboard(state.players);
    this.uiScene.updateCardHand(state.players[this.myPlayerId].hand);
    this.highlightValidMoves(state);
});
```

---

## 10. Card System

### 10.1 Deck Composition (43 cards total)

```python
DECK_COMPOSITION = {
    # Action cards (one-time use, discard after playing)
    "Harvest":   4,   # Take 2 of any resource from the bank
    "Plunder":   4,   # Steal 1 resource from any player (no robber)
    "Sabotage":  4,   # Move robber to any hex + steal (counts for Largest Army)
    "Caravan":   3,   # Make one bank trade at 2:1 this turn
    "Reinforce": 3,   # Place 1 free road connected to your network
    "Militia":   3,   # Block one player from building this turn
    "Surplus":   3,   # All your settlements/cities produce +1 this turn

    # Structure cards (permanent, attach to a settlement or city)
    "Watchtower": 2,  # See one opponent's hand at all times
    "Granary":    2,  # Settlement produces even with robber on it
    "Forge":      2,  # Cities on Ore hexes produce +1 Ore
    "Harbour":    2,  # Treat attached settlement as a 3:1 port
    "Barracks":   2,  # Immune to Militia cards

    # Event cards (resolve immediately when drawn, discard, then draw again)
    "Drought":    2,  # No Grain production next round
    "Gold Rush":  2,  # All players collect 1 Ore immediately
    "Earthquake": 2,  # All roads touching one random hex are removed
    "Festival":   2,  # All players draw 2 extra cards
    "Plague":     2,  # All players with 6+ resources discard 2

    # Victory Point cards (secret, held in hand until win)
    "Victory Point": 5  # +1 VP each, only revealed when winning
}
```

### 10.2 Card Resolution

```python
# server/card_system.py

def create_deck() -> list:
    deck = []
    for card_name, count in DECK_COMPOSITION.items():
        deck.extend([card_name] * count)
    random.shuffle(deck)
    return deck

def draw_card(state: dict, player_id: str) -> dict:
    """Draw top card. If Event, resolve immediately and draw again.
    If deck empty, shuffle discard pile into new deck."""
    if not state["deck"]["draw_pile"]:
        state["deck"]["draw_pile"] = state["deck"]["discard_pile"]
        random.shuffle(state["deck"]["draw_pile"])
        state["deck"]["discard_pile"] = []

    card_name = state["deck"]["draw_pile"].pop()
    card_type = get_card_type(card_name)

    if card_type == "event":
        state = resolve_event_card(state, card_name)
        state["deck"]["discard_pile"].append(card_name)
        state = draw_card(state, player_id)  # draw again after event
    else:
        card_instance = {
            "id": generate_card_id(),
            "type": card_type,
            "name": card_name
        }
        state["players"][player_id]["hand"].append(card_instance)

    return state

def resolve_action_card(state: dict, card_id: str, player_id: str, target: dict) -> dict:
    """Execute card effect, remove from hand, add to discard."""

def resolve_event_card(state: dict, card_name: str) -> dict:
    """Execute global event effect immediately."""
```

---

## 11. Platform Wrappers

### 11.1 Electron (Desktop — Windows + Mac)

```javascript
// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
        icon: path.join(__dirname, '../client/assets/ui/icon.png'),
        title: 'Realm'
    });
    win.loadFile(path.join(__dirname, '../client/index.html'));
    win.setMenuBarVisibility(false);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

Build commands:
```zsh
# In electron/ directory
npm run build:win    # → .exe
npm run build:mac    # → .dmg
```

### 11.2 Capacitor (Mobile — Android + iOS)

```json
// capacitor.config.json
{
    "appId": "com.yourname.realm",
    "appName": "Realm",
    "webDir": "client",
    "server": {
        "androidScheme": "https"
    },
    "plugins": {
        "SplashScreen": {
            "launchShowDuration": 2000,
            "backgroundColor": "#1a1a2e"
        }
    }
}
```

Build commands:
```zsh
npx cap sync
npx cap open android    # opens Android Studio → build APK
npx cap open ios        # opens Xcode → build IPA (Mac + Xcode required)
```

### 11.3 PWA (iPhone without App Store)

Add to `client/index.html`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

```json
// client/manifest.json
{
    "name": "Realm",
    "short_name": "Realm",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#1a1a2e",
    "theme_color": "#1a1a2e",
    "icons": [{ "src": "/assets/ui/icon-512.png", "sizes": "512x512", "type": "image/png" }]
}
```

iPhone users: open URL in Safari → Share → Add to Home Screen.

---

## 12. Deployment

### 12.1 Development (ngrok)

```zsh
# Terminal 1 — Flask server
cd realm/server
source venv/bin/activate
python app.py

# Terminal 2 — expose to internet
ngrok http 5000
# Copy the https://xxxx.ngrok-free.app URL
# Share with friends for testing

# In client/src/network.js during dev:
# const SERVER_URL = 'http://localhost:5000';
```

### 12.2 Production (Google Cloud e2-micro)

**VM specs:** e2-micro, us-central1-a, Ubuntu 22.04, 1GB RAM, 30GB disk

**SSH:**
```zsh
gcloud compute ssh realm-server --zone=us-central1-a
```

**Server setup (run once on VM):**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv nginx certbot python3-certbot-nginx git

git clone https://github.com/YOUR_USERNAME/realm.git
cd realm/server
python3 -m venv venv
source venv/bin/activate
pip install flask flask-socketio eventlet gunicorn
```

**systemd service:**
```ini
# /etc/systemd/system/realm.service
[Unit]
Description=Realm Game Server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/realm/server
Environment="PATH=/home/ubuntu/realm/server/venv/bin"
ExecStart=/home/ubuntu/realm/server/venv/bin/gunicorn \
    --worker-class eventlet \
    -w 1 \
    --bind 127.0.0.1:5000 \
    app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable realm
sudo systemctl start realm
```

**nginx config:**
```nginx
# /etc/nginx/sites-available/realm
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name realm.yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/realm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d realm.yourdomain.com
```

**Deploy update:**
```bash
cd /home/ubuntu/realm
git pull
sudo systemctl restart realm
```

### 12.3 DNS Records (at your domain registrar)

```
A    realm      YOUR_GCP_EXTERNAL_IP    TTL 300
```

---

## 13. Testing Approach

### Stage 1 — Logic only (no browser)
```zsh
python server/tests/test_game_logic.py
```
Test: resource distribution, building validation, longest road, win condition, card effects.

### Stage 2 — Single player UI
Open `client/index.html` in browser. Check board renders, dice rolls, UI updates correctly.

### Stage 3 — Two player sync
Chrome window (Player 1) + Firefox window (Player 2), both connecting to `localhost:5000`.
Verify state syncs correctly — actions in one window reflect in the other.

### Stage 4 — Bot player
```zsh
python server/tests/bot.py --room TEST --name Bot
```
Bot auto-rolls and ends turn. You play as human. Tests full game loop.

### Stage 5 — Real device
Your laptop (Chrome) + phone (ngrok URL). Tests touch input and mobile layout.

### Stage 6 — Friend test
Share ngrok URL via WhatsApp. Real latency, real user behaviour.

### Debug Panel
Add a hidden debug panel to UIScene (toggle with `D` key during development):
- Show raw game state as JSON
- Buttons: "Give me 5 of each resource", "Force next turn", "Move robber to hex 5", "Trigger win"
- Speeds up testing late-game mechanics without playing through 20 turns

---

## 14. Build Phases

Build strictly in this order. Do not skip phases.

```
PHASE 1 — Static Board (Week 1)
  [ ] board_generator.py — generate 19 hexes, 54 vertices, 72 edges
  [ ] HexBoard.js — render hex tiles with correct colors and number tokens
  [ ] HexMath.js — axial to pixel conversion
  [ ] Render ports on outer vertices
  [ ] No interaction yet — just visual

PHASE 2 — Game State + Logic (Week 2)
  [ ] game_logic.py — all validation and mutation functions
  [ ] card_system.py — deck creation, draw, event resolution
  [ ] test_game_logic.py — test resource distribution, building rules, win condition
  [ ] No server or client yet — pure Python logic tests

PHASE 3 — Server + Rooms (Week 3)
  [ ] app.py — Flask + SocketIO, all event handlers
  [ ] room_manager.py — create, join, cleanup rooms
  [ ] Test with two browser tabs on localhost

PHASE 4 — Full Client (Week 4)
  [ ] LobbyScene — create/join room UI, player list
  [ ] GameScene — interactive board, click handlers for vertices and edges
  [ ] UIScene — resources, cards, action buttons, turn indicator
  [ ] EndScene — winner display
  [ ] network.js — connect all scenes to server events

PHASE 5 — Full Game Loop (Week 5)
  [ ] Setup phase (two rounds of placement)
  [ ] Main turn loop (draw, roll, cards, trade, build, end)
  [ ] Trade UI (propose, accept/reject modal)
  [ ] Card hand UI (display, click to play)
  [ ] Robber placement UI

PHASE 6 — Platform Wrappers (Week 6)
  [ ] Electron wrapper, test Windows and Mac builds
  [ ] Capacitor wrapper, test Android APK
  [ ] PWA manifest, test iPhone Add to Home Screen

PHASE 7 — Deployment (Week 7)
  [ ] ngrok testing with real friend
  [ ] Google Cloud VM setup
  [ ] nginx + SSL
  [ ] Point custom domain

PHASE 8 — Polish (ongoing)
  [ ] Animations (dice roll, settlement placement, card play)
  [ ] Sound effects
  [ ] Chat panel
  [ ] Reconnection handling (player drops mid-game)
  [ ] Mobile touch target sizing
  [ ] Debug panel removal / feature flag
```

---

## 15. Key Constraints

**Never break these rules:**

1. **Server is authoritative.** Clients never modify game state. Every action is a request. Server validates, mutates, broadcasts.

2. **One gunicorn worker.** Flask-SocketIO + eventlet requires `-w 1`. Multiple workers break WebSocket state.

3. **Socket.IO versions must match.** Flask-SocketIO 5.x → Socket.IO JS client 4.x. Mismatching versions causes silent connection failures.

4. **Broadcast full state on every change.** Do not send diffs. Send the complete `game_state` object. Simpler, less error-prone, fast enough for a card game.

5. **No localStorage in Phaser/browser client.** All state lives on the server and in memory. Do not persist game state client-side.

6. **Distance rule is hard to get wrong.** When placing a settlement, check all adjacent vertices (not just the vertex itself) are empty. This is the most commonly broken rule in Catan implementations.

7. **Longest road breaks on opponent settlements.** A road is cut by an opposing player's settlement or city sitting on a vertex in the road chain. DFS must account for this.

8. **VP cards are secret until win.** Do not include VP card count in the public `victory_points` field. It lives in `vp_cards` separately. Only reveal when a player wins.

9. **Event cards trigger immediately and the player draws again.** The draw that produced an event card does not count as the player's draw — they keep drawing until they get a non-event card.

10. **Setup phase uses reverse order for round 2.** Player 1, 2, 3, 4, then 4, 3, 2, 1. This is critical for balance.
