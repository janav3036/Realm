import Phaser from 'phaser';
import Network from '../network.js';
import HexBoard from '../objects/HexBoard.js';
import { hexToPixel } from '../utils/HexMath.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data) {
        this.myPlayerId   = null;
        this.gameState    = data?.initialState ?? null;
        this.hexBoard     = null;
        this.buildMode    = null;
        this.vertexZones  = new Map();
        this.edgeZones    = new Map();
        this.hexZones     = new Map();
        this._hintGfx     = null;
        this._stateHandler = this._onStateUpdate.bind(this);
        this._errorHandler = this._onError.bind(this);
    }

    create() {
        this.myPlayerId = this.registry.get('myPlayerId');
        this.hexBoard   = new HexBoard(this);
        this._hintGfx   = this.add.graphics().setDepth(5);

        this.scene.launch('UIScene');

        Network.on('state_update', this._stateHandler);
        Network.on('error',        this._errorHandler);

        this.registry.events.on('changedata-buildMode', (_p, value) => {
            this.buildMode = value;
            if (this.gameState) {
                this._updateZones();
                this._drawHints();
            }
        });

        if (this.gameState) this._processState(this.gameState);
    }

    shutdown() {
        Network.off('state_update', this._stateHandler);
        Network.off('error',        this._errorHandler);
        this.scene.stop('UIScene');
    }

    // ── state ─────────────────────────────────────────────────────

    _onStateUpdate(state) {
        if (!state.board) return;
        if (!state.player_order.includes(this.myPlayerId)) {
            this.scene.stop('UIScene');
            this.scene.start('LobbyScene');
            return;
        }
        if (state.winner || state.game_over) {
            this.scene.stop('UIScene');
            this.scene.start('EndScene', { state });
            return;
        }
        this.gameState = state;
        this.registry.set('gameState', state);
        this._processState(state);
    }

    _processState(state) {
        this.hexBoard.render(state.board, state.players, state.robber_hex);
        if (this.vertexZones.size === 0) this._initZones(state.board);
        this._updateZones();
        this._drawHints();
    }

    // ── zones ─────────────────────────────────────────────────────

    _initZones(board) {
        const cx = this.scale.width  / 2;
        const cy = this.scale.height / 2;

        board.vertices.forEach(v => {
            const z = this.add.zone(cx + v.pixel_x, cy + v.pixel_y, 28, 28)
                .setInteractive({ cursor: 'pointer' }).setDepth(10);
            z.on('pointerdown', () => this._onVertexClick(v.id));
            this.vertexZones.set(v.id, z);
        });

        board.edges.forEach(e => {
            const v0 = board.vertices[e.vertices[0]];
            const v1 = board.vertices[e.vertices[1]];
            const z = this.add.zone(
                cx + (v0.pixel_x + v1.pixel_x) / 2,
                cy + (v0.pixel_y + v1.pixel_y) / 2,
                28, 28
            ).setInteractive({ cursor: 'pointer' }).setDepth(10);
            z.on('pointerdown', () => this._onEdgeClick(e.id));
            this.edgeZones.set(e.id, z);
        });

        board.hexes.forEach(h => {
            const { x, y } = hexToPixel(h.q, h.r);
            const z = this.add.zone(cx + x, cy + y, 110, 110)
                .setInteractive({ cursor: 'pointer' }).setDepth(10);
            z.on('pointerdown', () => this._onHexClick(h.id));
            this.hexZones.set(h.id, z);
        });
    }

    _updateZones() {
        const myTurn = this._isMyTurn();
        const phase  = this.gameState?.turn?.phase;

        const showV = myTurn && (
            phase === 'setup_s1' || phase === 'setup_s2' ||
            (phase === 'action' && (this.buildMode === 'settlement' || this.buildMode === 'city'))
        );
        const showE = myTurn && (
            phase === 'setup_road' ||
            (phase === 'action' && this.buildMode === 'road')
        );
        const showH = myTurn && phase === 'robber';

        this.vertexZones.forEach(z => z.setActive(showV));
        this.edgeZones.forEach(z   => z.setActive(showE));
        this.hexZones.forEach(z    => z.setActive(showH));
    }

    _drawHints() {
        this._hintGfx.clear();
        if (!this._isMyTurn() || !this.gameState) return;

        const phase = this.gameState.turn.phase;
        const board = this.gameState.board;
        const me    = this.gameState.players[this.myPlayerId];
        const cx    = this.scale.width  / 2;
        const cy    = this.scale.height / 2;

        const showV = phase === 'setup_s1' || phase === 'setup_s2' ||
            (phase === 'action' && (this.buildMode === 'settlement' || this.buildMode === 'city'));
        const showE = phase === 'setup_road' ||
            (phase === 'action' && this.buildMode === 'road');
        const showH = phase === 'robber';

        this._hintGfx.lineStyle(2, 0xffffff, 0.5);

        if (showV) {
            let vertices;
            if (this.buildMode === 'city') {
                // Only own settlements can be upgraded
                vertices = board.vertices.filter(v =>
                    v.building === 'settlement' && v.owner === this.myPlayerId
                );
            } else {
                // Empty vertex + distance rule: no adjacent building
                const myRoads    = new Set(me.buildings.roads);
                const myRoadVerts = new Set();
                board.edges.forEach(e => {
                    if (myRoads.has(e.id)) e.vertices.forEach(vid => myRoadVerts.add(vid));
                });
                const myBuildings = new Set([...me.buildings.settlements, ...me.buildings.cities]);

                vertices = board.vertices.filter(v => {
                    if (v.building) return false;
                    if (v.adjacent_vertices.some(aid => board.vertices[aid].building)) return false;
                    // During setup no road connection required; main game requires it
                    if (phase === 'action' && !myRoadVerts.has(v.id)) return false;
                    return true;
                });
            }
            vertices.forEach(v => {
                this._hintGfx.strokeCircle(cx + v.pixel_x, cy + v.pixel_y, 12);
            });
        }

        if (showE) {
            const mySettlements = new Set(me.buildings.settlements);
            const myCities      = new Set(me.buildings.cities);
            const myRoads       = new Set(me.buildings.roads);
            const myRoadVerts   = new Set();
            board.edges.forEach(e => {
                if (myRoads.has(e.id)) e.vertices.forEach(vid => myRoadVerts.add(vid));
            });
            const connectedVerts = new Set([...mySettlements, ...myCities, ...myRoadVerts]);

            const edges = board.edges.filter(e => {
                if (e.road) return false;
                if (phase === 'setup_road') {
                    return e.vertices.some(vid => mySettlements.has(vid));
                }
                // Main game: must connect to own road/settlement/city
                return e.vertices.some(vid => connectedVerts.has(vid));
            });

            edges.forEach(e => {
                const v0 = board.vertices[e.vertices[0]];
                const v1 = board.vertices[e.vertices[1]];
                const mx = cx + (v0.pixel_x + v1.pixel_x) / 2;
                const my = cy + (v0.pixel_y + v1.pixel_y) / 2;
                this._hintGfx.strokeCircle(mx, my, 7);
            });
        }

        if (showH) {
            board.hexes.forEach(h => {
                if (h.id !== this.gameState.robber_hex) {
                    const { x, y } = hexToPixel(h.q, h.r);
                    this._hintGfx.strokeCircle(cx + x, cy + y, 50);
                }
            });
        }
    }

    // ── click handlers ────────────────────────────────────────────

    _onVertexClick(vid) {
        const phase = this.gameState?.turn?.phase;
        if (phase === 'setup_s1' || phase === 'setup_s2') {
            Network.sendAction({ type: 'place_setup_settlement', vertex_id: vid });
        } else if (this.buildMode === 'settlement') {
            Network.sendAction({ type: 'build_settlement', vertex_id: vid });
            this.registry.set('buildMode', null);
        } else if (this.buildMode === 'city') {
            Network.sendAction({ type: 'build_city', vertex_id: vid });
            this.registry.set('buildMode', null);
        }
    }

    _onEdgeClick(eid) {
        const phase = this.gameState?.turn?.phase;
        if (phase === 'setup_road') {
            Network.sendAction({ type: 'place_setup_road', edge_id: eid });
        } else if (this.buildMode === 'road') {
            Network.sendAction({ type: 'build_road', edge_id: eid });
            this.registry.set('buildMode', null);
        }
    }

    _onHexClick(hid) {
        if (this.gameState?.turn?.phase !== 'robber') return;
        const board = this.gameState.board;
        const hex   = board.hexes[hid];
        const others = (hex.adjacent_vertices ?? [])
            .map(vid => board.vertices[vid].owner)
            .filter(o => o && o !== this.myPlayerId);
        Network.sendAction({ type: 'move_robber', hex_id: hid, steal_from: others[0] ?? null });
    }

    // ── helpers ───────────────────────────────────────────────────

    _isMyTurn() {
        return this.gameState?.turn?.current_player === this.myPlayerId;
    }

    _onError(data) {
        const { width, height } = this.scale;
        const t = this.add.text(width / 2, height / 2 - 20, `⚠ ${data.message}`, {
            fontSize: '18px', color: '#e74c3c',
            backgroundColor: '#1a1a2e', padding: { x: 14, y: 8 },
        }).setOrigin(0.5).setDepth(200);
        this.time.delayedCall(3000, () => t.destroy());
    }
}
