import Phaser from 'phaser';
import Network from '../network.js';
import HexBoard from '../objects/HexBoard.js';
import { hexToPixel } from '../utils/HexMath.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data) {
        this.myPlayerId     = null;
        this.gameState      = data?.initialState ?? null;
        this.hexBoard       = null;
        this.buildMode      = null;
        this.vertexZones    = new Map();
        this.edgeZones      = new Map();
        this.hexZones       = new Map();
        this._hintGfx       = null;
        this._layout        = null;
        this._zoom          = 1;
        this._lastPinchDist = null;
        this._wasPinching   = false;
        this._isMobile      = false;
        this._stateHandler  = this._onStateUpdate.bind(this);
        this._errorHandler  = this._onError.bind(this);
        this._pinchPanFn    = null;
        this._pinchUpFn     = null;
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

        // Mobile pinch-to-zoom + pan
        this._isMobile = ('ontouchstart' in window && this.scale.width <= 900)
                       || !!(window.matchMedia?.('(pointer: coarse)').matches);
        if (this._isMobile) {
            this._pinchPanFn = this._onPinchPan.bind(this);
            this._pinchUpFn  = this._onPinchUp.bind(this);
            this.input.on('pointermove', this._pinchPanFn);
            this.input.on('pointerup',   this._pinchUpFn);
        }

        if (this.gameState) this._processState(this.gameState);
    }

    shutdown() {
        Network.off('state_update', this._stateHandler);
        Network.off('error',        this._errorHandler);
        if (this._isMobile) {
            this.input.off('pointermove', this._pinchPanFn);
            this.input.off('pointerup',   this._pinchUpFn);
        }
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
            Network.clearSession();
            this.scene.stop('UIScene');
            this.scene.start('EndScene', { state });
            return;
        }
        this.gameState = state;
        this.registry.set('gameState', state);
        this._processState(state);
    }

    _processState(state) {
        const newLayout = this._computeLayout();
        const prev      = this._layout;
        const changed   = !prev
            || Math.abs(newLayout.scale - prev.scale) > 0.01
            || Math.abs(newLayout.cx - prev.cx) > 2
            || Math.abs(newLayout.cy - prev.cy) > 2;
        this._layout = newLayout;

        this.hexBoard.render(state.board, state.players, state.robber_hex, this._layout);

        if (this.vertexZones.size === 0 || changed) {
            this.vertexZones.forEach(z => z.destroy());
            this.edgeZones.forEach(z => z.destroy());
            this.hexZones.forEach(z => z.destroy());
            this.vertexZones.clear();
            this.edgeZones.clear();
            this.hexZones.clear();
            this._initZones(state.board);
        }

        this._updateZones();
        this._drawHints();
    }

    // ── zones ─────────────────────────────────────────────────────

    _initZones(board) {
        const { cx, cy, scale: sc } = this._layout ?? { cx: this.scale.width / 2, cy: this.scale.height / 2, scale: 1 };
        const touch = 'ontouchstart' in window;
        const vSize = touch ? 44 : Math.max(28, Math.round(28 * sc));
        const eSize = touch ? 44 : Math.max(28, Math.round(28 * sc));
        const hSize = touch ? Math.max(80, Math.round(110 * sc)) : Math.max(80, Math.round(110 * sc));

        board.vertices.forEach(v => {
            const z = this.add.zone(cx + v.pixel_x * sc, cy + v.pixel_y * sc, vSize, vSize)
                .setInteractive({ cursor: 'pointer' }).setDepth(10);
            z.on('pointerdown', () => this._onVertexClick(v.id));
            this.vertexZones.set(v.id, z);
        });

        board.edges.forEach(e => {
            const v0 = board.vertices[e.vertices[0]];
            const v1 = board.vertices[e.vertices[1]];
            const z = this.add.zone(
                cx + (v0.pixel_x + v1.pixel_x) / 2 * sc,
                cy + (v0.pixel_y + v1.pixel_y) / 2 * sc,
                eSize, eSize
            ).setInteractive({ cursor: 'pointer' }).setDepth(10);
            z.on('pointerdown', () => this._onEdgeClick(e.id));
            this.edgeZones.set(e.id, z);
        });

        board.hexes.forEach(h => {
            const { x, y } = hexToPixel(h.q, h.r);
            const z = this.add.zone(cx + x * sc, cy + y * sc, hSize, hSize)
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
        const { cx, cy, scale: sc } = this._layout ?? { cx: this.scale.width / 2, cy: this.scale.height / 2, scale: 1 };

        const showV = phase === 'setup_s1' || phase === 'setup_s2' ||
            (phase === 'action' && (this.buildMode === 'settlement' || this.buildMode === 'city'));
        const showE = phase === 'setup_road' ||
            (phase === 'action' && this.buildMode === 'road');
        const showH = phase === 'robber';

        this._hintGfx.lineStyle(2, 0xc9a227, 0.6);

        if (showV) {
            let vertices;
            if (this.buildMode === 'city') {
                vertices = board.vertices.filter(v =>
                    v.building === 'settlement' && v.owner === this.myPlayerId
                );
            } else {
                const myRoads     = new Set(me.buildings.roads);
                const myRoadVerts = new Set();
                board.edges.forEach(e => {
                    if (myRoads.has(e.id)) e.vertices.forEach(vid => myRoadVerts.add(vid));
                });
                vertices = board.vertices.filter(v => {
                    if (v.building) return false;
                    if (v.adjacent_vertices.some(aid => board.vertices[aid].building)) return false;
                    if (phase === 'action' && !myRoadVerts.has(v.id)) return false;
                    return true;
                });
            }
            vertices.forEach(v => {
                this._hintGfx.strokeCircle(cx + v.pixel_x * sc, cy + v.pixel_y * sc, Math.max(8, 12 * sc));
            });
        }

        if (showE) {
            const mySettlements  = new Set(me.buildings.settlements);
            const myCities       = new Set(me.buildings.cities);
            const myRoads        = new Set(me.buildings.roads);
            const myRoadVerts    = new Set();
            board.edges.forEach(e => {
                if (myRoads.has(e.id)) e.vertices.forEach(vid => myRoadVerts.add(vid));
            });
            const connectedVerts = new Set([...mySettlements, ...myCities, ...myRoadVerts]);

            const edges = board.edges.filter(e => {
                if (e.road) return false;
                if (phase === 'setup_road') return e.vertices.some(vid => mySettlements.has(vid));
                return e.vertices.some(vid => connectedVerts.has(vid));
            });

            edges.forEach(e => {
                const v0 = board.vertices[e.vertices[0]];
                const v1 = board.vertices[e.vertices[1]];
                const mx = cx + (v0.pixel_x + v1.pixel_x) / 2 * sc;
                const my = cy + (v0.pixel_y + v1.pixel_y) / 2 * sc;
                this._hintGfx.strokeCircle(mx, my, Math.max(5, 7 * sc));
            });
        }

        if (showH) {
            board.hexes.forEach(h => {
                if (h.id !== this.gameState.robber_hex) {
                    const { x, y } = hexToPixel(h.q, h.r);
                    this._hintGfx.strokeCircle(cx + x * sc, cy + y * sc, Math.max(30, 50 * sc));
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

    // ── pinch-to-zoom + pan ───────────────────────────────────────

    _onPinchPan(pointer) {
        const cam = this.cameras.main;
        const p1  = this.input.pointer1;
        const p2  = this.input.pointer2;

        if (p1.isDown && p2.isDown) {
            // Two-finger pinch → zoom around the midpoint of both fingers
            const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
            if (this._lastPinchDist !== null && dist > 8) {
                const factor  = dist / this._lastPinchDist;
                const oldZoom = this._zoom;
                this._zoom    = Phaser.Math.Clamp(this._zoom * factor, 0.55, 3.0);

                // Keep the pinch focal point (midpoint in world space) fixed
                const midX      = (p1.x + p2.x) / 2;
                const midY      = (p1.y + p2.y) / 2;
                const worldMidX = cam.scrollX + midX / oldZoom;
                const worldMidY = cam.scrollY + midY / oldZoom;
                cam.setZoom(this._zoom);
                cam.scrollX = worldMidX - midX / this._zoom;
                cam.scrollY = worldMidY - midY / this._zoom;
            }
            this._lastPinchDist = dist;
            this._wasPinching   = true;
        } else {
            this._lastPinchDist = null;
            // Skip first move frame after releasing second finger to avoid jump
            if (this._wasPinching) { this._wasPinching = false; return; }
            // Single-finger pan when zoomed in
            if (p1.isDown && this._zoom > 1.08 && pointer === p1) {
                cam.scrollX -= (pointer.x - pointer.prevPosition.x) / this._zoom;
                cam.scrollY -= (pointer.y - pointer.prevPosition.y) / this._zoom;
            }
        }
    }

    _onPinchUp() {
        this._lastPinchDist = null;
        // Snap back to neutral when zoomed below threshold
        if (this._zoom < 1.05) {
            this._zoom = 1;
            this.cameras.main.setZoom(1);
            this.cameras.main.setScroll(0, 0);
        }
    }

    // ── layout ───────────────────────────────────────────────────

    _computeLayout() {
        const W = this.scale.width;
        const H = this.scale.height;
        const isMobile = ('ontouchstart' in window && W <= 900)
                       || !!(window.matchMedia?.('(pointer: coarse)').matches);

        // Board pixel extents at server's hex_size=80
        const BOARD_W = 693;
        const BOARD_H = 640;

        if (!isMobile) {
            // Desktop: keep existing behaviour (sidebar on right, cx = W/2)
            return { cx: W / 2, cy: H / 2, scale: 1 };
        }

        const isLandscape = W > H;
        const PEEK_H = 92; // portrait peek-strip height

        if (isLandscape) {
            // Side panel (46px strip) on right
            const availW = W - 46;
            const availH = H;
            const scale  = Math.min(availW * 0.94 / BOARD_W, availH * 0.90 / BOARD_H);
            return { cx: availW / 2, cy: H / 2, scale };
        }

        // Portrait: peek strip at bottom
        const availW = W;
        const availH = H - PEEK_H;
        const scale  = Math.min(availW * 0.95 / BOARD_W, availH * 0.90 / BOARD_H);
        return { cx: W / 2, cy: availH / 2, scale };
    }

    // ── helpers ───────────────────────────────────────────────────

    _isMyTurn() {
        return this.gameState?.turn?.current_player === this.myPlayerId;
    }

    _onError(data) {
        const { width, height } = this.scale;
        const t = this.add.text(width / 2, height / 2 - 20, `⚠  ${data.message}`, {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '14px',
            color: '#c41e3a',
            backgroundColor: '#07060f',
            padding: { x: 16, y: 10 },
        }).setOrigin(0.5).setDepth(200);
        this.time.delayedCall(3000, () => t.destroy());
    }
}
