import Phaser from 'phaser';
import Network from '../network.js';

const COLOR_MAP = { red: '#e74c3c', blue: '#3498db', green: '#2ecc71', orange: '#e67e22' };
const COLOR_HEX = { red: 0xe74c3c, blue: 0x3498db, green: 0x2ecc71, orange: 0xe67e22 };
const COSTS = {
    road:       '1 TIM  1 STN',
    settlement: '1 TIM  1 STN  1 GRN  1 WOL',
    city:       '3 ORE  2 GRN',
    buy_card:   '1 ORE  1 GRN  1 WOL',
};
const CARD_INFO = {
    'Harvest':       'Take 2 of any one resource from the bank.',
    'Plunder':       'Steal 1 resource from any player — no robber move needed.',
    'Sabotage':      'Move the robber to any hex and steal. Counts toward Largest Army.',
    'Caravan':       'Make one bank trade at 2:1 for any resource this turn.',
    'Reinforce':     'Place 1 free road connected to your existing network.',
    'Militia':       'Block one player from building any structures this turn.',
    'Surplus':       'All your settlements and cities produce +1 resource this turn.',
    'Watchtower':    "Attach to a settlement — see one opponent's full hand at all times.",
    'Granary':       'Attach to a settlement — it produces even with the robber on its hex.',
    'Forge':         'Attach to a city on an Ore hex — that city produces +1 Ore when it rolls.',
    'Harbour':       'Attach to a settlement — it acts as a 3:1 port.',
    'Barracks':      'Attach to a settlement — you are immune to Militia cards.',
    'Drought':       'EVENT: No Grain produced next round for anyone.',
    'Gold Rush':     'EVENT: All players immediately collect 1 Ore.',
    'Earthquake':    'EVENT: All roads touching one randomly chosen hex are removed.',
    'Festival':      'EVENT: All players immediately draw 2 extra cards.',
    'Plague':        'EVENT: All players with 6+ resources must discard 2.',
    'Victory Point': '+1 Victory Point. Secret until you win.',
};

const SBAR = 224;

export default class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene' }); }

    init() {
        this.myPlayerId    = null;
        this.gameState     = null;
        this._dynItems     = [];
        this._modalItems   = [];
        this._showingModal = null;
        this._collapsed      = false;
        this._stateHandler   = this._onStateUpdate.bind(this);
        this._registryHandler = null;
    }

    create() {
        this.myPlayerId = this.registry.get('myPlayerId');
        const { width, height } = this.scale;

        // Sidebar background panel
        this._sidebarBg = this.add.rectangle(width - SBAR, 0, SBAR, height, 0x0d0d1e, 0.96)
            .setOrigin(0, 0).setDepth(19);

        // Collapse/expand tab on left edge of sidebar
        this._tabBg = this.add.rectangle(width - SBAR - 18, height / 2, 20, 56, 0x0d0d1e, 0.9)
            .setOrigin(0, 0.5).setDepth(20).setInteractive({ cursor: 'pointer' });
        this._tabArrow = this.add.text(width - SBAR - 8, height / 2, '»', {
            fontSize: '13px', color: '#666688',
        }).setOrigin(0.5).setDepth(21).setInteractive({ cursor: 'pointer' });
        this._tabBg.on('pointerdown',    () => this._toggleSidebar());
        this._tabArrow.on('pointerdown', () => this._toggleSidebar());

        this._registryHandler = (_p, v) => this._onStateUpdate(v);
        Network.on('state_update', this._stateHandler);
        this.registry.events.on('changedata-gameState', this._registryHandler);

        const gs = this.registry.get('gameState');
        if (gs) this._onStateUpdate(gs);
    }

    shutdown() {
        Network.off('state_update', this._stateHandler);
        if (this._registryHandler) {
            this.registry.events.off('changedata-gameState', this._registryHandler);
        }
    }

    // ── sidebar toggle ────────────────────────────────────────────

    _toggleSidebar() {
        this._collapsed = !this._collapsed;
        const { width, height } = this.scale;
        if (this._collapsed) {
            this._sidebarBg.setVisible(false);
            this._tabBg.setX(width - 18);
            this._tabArrow.setX(width - 8).setText('«');
        } else {
            this._sidebarBg.setVisible(true);
            this._tabBg.setX(width - SBAR - 18);
            this._tabArrow.setX(width - SBAR - 8).setText('»');
        }
        if (this.gameState) this._renderDynamic();
    }

    // ── state update ──────────────────────────────────────────────

    _onStateUpdate(state) {
    if (!state?.board) return;
    if (state.game_over || state.winner) {
        this.scene.stop();
        return;
    }
    this.gameState = state;
    this._renderDynamic();
}


    // ── dynamic render ────────────────────────────────────────────

    _clearDyn() { this._dynItems.forEach(o => o.destroy()); this._dynItems = []; }
    _clearModal() { this._modalItems.forEach(o => o.destroy()); this._modalItems = []; this._showingModal = null; }
    _dtrack(...items) { this._dynItems.push(...items); }
    _mtrack(...items) { this._modalItems.push(...items); }

    _renderDynamic() {
        this._clearDyn();
        if (this._collapsed) return;

        const state    = this.gameState;
        const me       = state.players[this.myPlayerId];
        const isMyTurn = state.turn.current_player === this.myPlayerId;
        const phase    = state.turn.phase;
        const { width, height } = this.scale;
        const SX = width - SBAR;        // sidebar left edge
        const SC = SX + SBAR / 2;      // sidebar center x

        let sy = 10;
        sy = this._renderSidebarInfo(state, SX, SC, sy);
        sy = this._renderSidebarResources(me, SX, SC, sy);
        sy = this._renderSidebarCards(me, state, SX, SC, sy);

        if (isMyTurn) {
            this._renderSidebarButtons(phase, state, SX, SC);
        } else {
            this._dtrack(
                this.add.text(SC, height - 130, 'Waiting for\nother player…', {
                    fontSize: '12px', color: '#555577', align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        }

        this._renderSidebarExit(SX, SC, height);

        // Discard modal
        const mustDiscard = state.turn.must_discard ?? [];
        if (mustDiscard.includes(this.myPlayerId) && this._showingModal !== 'discard') {
            this._showDiscardModal(me, state);
        } else if (!mustDiscard.includes(this.myPlayerId) && this._showingModal === 'discard') {
            this._clearModal();
        }

        // Incoming trade proposal
        const trade = state.turn.active_trade;
        if (trade && trade.to_player === this.myPlayerId && trade.status === 'pending'
            && this._showingModal !== 'trade_response') {
            this._showTradeResponseModal(trade, state);
        } else if (this._showingModal === 'trade_response'
            && (!trade || trade.to_player !== this.myPlayerId || trade.status !== 'pending')) {
            this._clearModal();
        }
    }

    // ── sidebar sections ──────────────────────────────────────────

    _renderSidebarInfo(state, SX, SC, sy) {
        const turn  = state.turn;
        const PHASE = {
            setup_s1: 'Place Settlement', setup_s2: 'Place Settlement',
            setup_road: 'Place Road',
            draw: 'Draw a card', roll: 'Roll the dice', action: 'Your actions',
            robber: 'Move the robber', discard: 'Discard resources',
        };
        const cp    = state.players[turn.current_player];
        const label = PHASE[turn.phase] ?? turn.phase;
        const mine  = turn.current_player === this.myPlayerId;
        const col   = mine ? '#e8d5a3' : (COLOR_MAP[cp?.color] ?? '#ffffff');

        this._dtrack(
            this.add.text(SC, sy, mine ? '▶ You' : (cp?.name ?? '?'), {
                fontSize: '14px', color: col, fontStyle: 'bold',
            }).setOrigin(0.5, 0).setDepth(21),
            this.add.text(SC, sy + 18, label, {
                fontSize: '11px', color: '#777799',
            }).setOrigin(0.5, 0).setDepth(21)
        );
        sy += 38;

        if (turn.dice) {
            const [d1, d2] = turn.dice;
            this._dtrack(
                this.add.text(SC, sy, `🎲 ${d1} + ${d2} = ${turn.dice_total}`, {
                    fontSize: '13px', color: '#ffffff',
                }).setOrigin(0.5, 0).setDepth(21)
            );
            sy += 17;
            if (turn.phase !== 'roll' && turn.phase !== 'draw') {
                const gains = {};
                state.board.hexes.forEach(h => {
                    if (h.number === turn.dice_total && h.id !== state.robber_hex) {
                        (h.adjacent_vertices ?? []).forEach(vid => {
                            const v = state.board.vertices[vid];
                            if (v.building) {
                                const amt = v.building === 'city' ? 2 : 1;
                                gains[h.resource] = (gains[h.resource] ?? 0) + amt;
                            }
                        });
                    }
                });
                const line = Object.keys(gains).length
                    ? Object.entries(gains).map(([r, n]) => `+${n} ${r.slice(0,3).toUpperCase()}`).join('  ')
                    : 'No production';
                this._dtrack(
                    this.add.text(SC, sy, line, { fontSize: '10px', color: '#aaccaa' }).setOrigin(0.5, 0).setDepth(21)
                );
                sy += 15;
            }
        }
        sy += 6;

        state.player_order.forEach(pid => {
            const p  = state.players[pid];
            const vp = p.victory_points + p.vp_cards +
                (state.longest_road_owner === pid ? 2 : 0) +
                (state.largest_army_owner === pid ? 2 : 0);
            const star = pid === this.myPlayerId ? '★ ' : '    ';
            this._dtrack(
                this.add.text(SC, sy, `${star}${p.name}: ${vp} VP`, {
                    fontSize: '11px', color: COLOR_MAP[p.color] ?? '#ffffff',
                }).setOrigin(0.5, 0).setDepth(21)
            );
            sy += 14;
        });

        return sy + 8;
    }

    _renderSidebarResources(me, SX, SC, sy) {
        const RES = [
            { key: 'timber', bg: 0x1a5c1a, label: 'TIM' },
            { key: 'stone',  bg: 0x555555, label: 'STN' },
            { key: 'grain',  bg: 0x8a6a00, label: 'GRN' },
            { key: 'wool',   bg: 0x3a6a20, label: 'WOL' },
            { key: 'ore',    bg: 0x333344, label: 'ORE' },
        ];
        const BW = 36, BH = 44, GAP = 4;
        const totalW = 5 * BW + 4 * GAP;
        const startX = SX + (SBAR - totalW) / 2;

        this._dtrack(
            this.add.text(SC, sy, 'RESOURCES', { fontSize: '10px', color: '#555577' }).setOrigin(0.5, 0).setDepth(21)
        );
        sy += 14;

        RES.forEach((r, i) => {
            const x = startX + i * (BW + GAP);
            const count = me?.resources[r.key] ?? 0;
            this._dtrack(
                this.add.rectangle(x, sy, BW, BH, r.bg, 0.8).setOrigin(0, 0).setDepth(21),
                this.add.text(x + BW / 2, sy + 8,  r.label, { fontSize: '9px',  color: '#888899' }).setOrigin(0.5, 0).setDepth(22),
                this.add.text(x + BW / 2, sy + 22, String(count), { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(22)
            );
        });

        return sy + BH + 10;
    }

    _renderSidebarCards(me, state, SX, SC, sy) {
        const hand     = me?.hand ?? [];
        const CW = 58, CH = 70, GAP = 4, COLS = 3;
        const totalW   = COLS * CW + (COLS - 1) * GAP;
        const startX   = SX + (SBAR - totalW) / 2;
        const isMyTurn = state.turn.current_player === this.myPlayerId;
        const phase    = state.turn.phase;
        const TYPE_COL = { action: 0x2255aa, structure: 0x6a2280, vp: 0x8a6a00 };

        this._dtrack(
            this.add.text(SC, sy, `HAND (${hand.length})`, { fontSize: '10px', color: '#555577' }).setOrigin(0.5, 0).setDepth(21)
        );
        sy += 13;

        hand.forEach((card, i) => {
            const row    = Math.floor(i / COLS);
            const colIdx = i % COLS;
            const x      = startX + colIdx * (CW + GAP);
            const y      = sy + row * (CH + GAP);
            const canPlay = isMyTurn && phase === 'action' && card.type !== 'vp';
            const col     = TYPE_COL[card.type] ?? 0x333355;

            const bg = this.add.rectangle(x, y, CW, CH, col, canPlay ? 1.0 : 0.45)
                .setOrigin(0, 0).setDepth(21);
            const nm = this.add.text(x + CW / 2, y + CH / 2, card.name, {
                fontSize: '9px', color: '#ffffff',
                wordWrap: { width: CW - 4 }, align: 'center',
            }).setOrigin(0.5).setDepth(22);
            this._dtrack(bg, nm);

            let pressTimer = null;
            bg.setInteractive({ cursor: 'pointer' });
            bg.on('pointerdown', () => {
                pressTimer = this.time.delayedCall(500, () => { pressTimer = null; this._showCardPopup(card); });
            });
            bg.on('pointerup', () => {
                if (pressTimer) {
                    pressTimer.remove(); pressTimer = null;
                    if (canPlay) this._playCard(card, state);
                }
            });
            bg.on('pointerover', () => bg.setAlpha(canPlay ? 0.7 : 0.6));
            bg.on('pointerout', () => {
                bg.setAlpha(canPlay ? 1.0 : 0.45);
                if (pressTimer) { pressTimer.remove(); pressTimer = null; }
            });
        });

        const rows = Math.ceil(Math.max(hand.length, 1) / COLS);
        return sy + rows * (CH + GAP) + 10;
    }

    _renderSidebarButtons(phase, state, SX, SC) {
        const { height } = this.scale;
        const BW2 = Math.floor((SBAR - 24) / 2);  // half-width button
        const BH  = 26, GAP = 4;
        const x1  = SX + 10;
        const x2  = SX + 10 + BW2 + GAP;
        const FW  = SBAR - 20;                     // full-width button
        const buildMode = this.registry.get('buildMode');
        const hi = (mode) => buildMode === mode ? 0x1a4a7a : 0x2c3e50;

        // Buttons render from bottom-up: exit at very bottom, then action buttons above
        const BOT = height - 40;
        let by = BOT;

        const btn = (x, y, label, color, cb, full = false) => {
            const w  = full ? FW : BW2;
            const cx = full ? SC : (x + w / 2);
            const bg = this.add.rectangle(x, y, w, BH, color, 1)
                .setOrigin(0, 0).setDepth(21).setInteractive({ cursor: 'pointer' });
            const t  = this.add.text(cx, y + BH / 2, label, { fontSize: '12px', color: '#ffffff' })
                .setOrigin(0.5).setDepth(22);
            bg.on('pointerover', () => bg.setAlpha(0.75));
            bg.on('pointerout',  () => bg.setAlpha(1));
            bg.on('pointerdown', cb);
            this._dtrack(bg, t);
        };

        const cost = (x, y, key, full = false) => {
            const w = full ? FW : BW2;
            this._dtrack(
                this.add.text(x + w / 2, y + BH + 2, COSTS[key], {
                    fontSize: '8px', color: '#888899',
                }).setOrigin(0.5, 0).setDepth(22)
            );
        };

        if (phase === 'draw') {
            by -= BH;
            btn(x1, by, 'Draw Card', 0x2255aa, () => Network.sendAction({ type: 'draw_card' }), true);

        } else if (phase === 'roll') {
            by -= BH;
            btn(x1, by, 'Roll Dice 🎲', 0x2d8f5f, () => Network.sendAction({ type: 'roll_dice' }), true);

        } else if (phase === 'action') {
            // End Turn (bottom)
            by -= BH;
            btn(x1, by, 'End Turn', 0xc0392b, () => {
                Network.sendAction({ type: 'end_turn' });
                this.registry.set('buildMode', null);
            }, true);
            // Bank + P2P trade row
            by -= BH + GAP + 4;
            btn(x1, by, 'Bank',      0x117a65, () => this._showTradeModal(state));
            btn(x2, by, 'P2P Trade', 0x2471a3, () => this._showP2PTradeModal(state));
            // City + Buy Card row
            by -= BH + GAP + 14;
            btn(x1, by, 'City',     hi('city'),  () => this._toggleBuild('city'));
            cost(x1, by, 'city');
            btn(x2, by, 'Buy Card', 0x6c3483,   () => Network.sendAction({ type: 'buy_extra_card' }));
            cost(x2, by, 'buy_card');
            // Road + Settlement row
            by -= BH + GAP + 14;
            btn(x1, by, 'Road',       hi('road'),       () => this._toggleBuild('road'));
            cost(x1, by, 'road');
            btn(x2, by, 'Settlement', hi('settlement'), () => this._toggleBuild('settlement'));
            cost(x2, by, 'settlement');

        } else if (phase === 'setup_s1' || phase === 'setup_s2') {
            by -= 36;
            this._dtrack(
                this.add.text(SC, by, 'Click a vertex\nto place your settlement', {
                    fontSize: '12px', color: '#e8d5a3', align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        } else if (phase === 'setup_road') {
            by -= 30;
            this._dtrack(
                this.add.text(SC, by, 'Click an edge\nto place your road', {
                    fontSize: '12px', color: '#e8d5a3', align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        } else if (phase === 'robber') {
            by -= 30;
            this._dtrack(
                this.add.text(SC, by, 'Click a hex\nto move the robber', {
                    fontSize: '12px', color: '#e74c3c', align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        }
    }

    _renderSidebarExit(SX, SC, height) {
        const isHost = !!this.registry.get('isHost');
        const label  = isHost ? 'End Game' : 'Exit';
        const y      = height - 10;
        const bg = this.add.rectangle(SX + 10, y, SBAR - 20, 22, 0x7f1d1d, 0.9)
            .setOrigin(0, 1).setDepth(21).setInteractive({ cursor: 'pointer' });
        const t  = this.add.text(SC, y - 11, label, { fontSize: '12px', color: '#ffffff' })
            .setOrigin(0.5).setDepth(22);
        bg.on('pointerover', () => bg.setAlpha(0.7));
        bg.on('pointerout',  () => bg.setAlpha(0.9));
        bg.on('pointerdown', () => { if (isHost) Network.endGame(); else Network.quitGame(); });
        this._dtrack(bg, t);
    }

    // ── build mode toggle ─────────────────────────────────────────

    _toggleBuild(mode) {
        const current = this.registry.get('buildMode');
        this.registry.set('buildMode', current === mode ? null : mode);
    }

    // ── card playing ──────────────────────────────────────────────

    _playCard(card, state) {
        const NO_TARGET = ['Caravan', 'Surplus', 'Reinforce', 'Sabotage'];
        if (NO_TARGET.includes(card.name)) {
            Network.sendAction({ type: 'play_card', card_id: card.id });
            return;
        }
        if (card.name === 'Harvest') {
            this._showHarvestModal(card.id);
        } else if (card.name === 'Plunder' || card.name === 'Militia') {
            this._showPlayerPickModal(card.id, state);
        } else {
            Network.sendAction({ type: 'play_card', card_id: card.id });
        }
    }

    // ── card popup modal ──────────────────────────────────────────

    _showCardPopup(card) {
        this._clearModal();
        this._showingModal = 'card_popup';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const CW = 220, CH = 300;
        const TYPE_COL = { action: 0x2255aa, structure: 0x6a2280, vp: 0x8a6a00, event: 0x8a2222 };
        const col = TYPE_COL[card.type] ?? 0x333355;

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.6)
            .setOrigin(0, 0).setDepth(48).setInteractive();
        backdrop.on('pointerdown', () => this._clearModal());
        this._mtrack(backdrop);

        const showFront = () => {
            const panel = this.add.rectangle(MX, MY, CW, CH, col, 1)
                .setOrigin(0.5).setDepth(49).setStrokeStyle(3, 0xffffff, 0.3).setInteractive({ cursor: 'pointer' });
            const typeT = this.add.text(MX, MY - CH / 2 + 22, card.type.toUpperCase(), { fontSize: '11px', color: '#ffffff', alpha: 0.6 }).setOrigin(0.5).setDepth(50);
            const nameT = this.add.text(MX, MY, card.name, { fontSize: '24px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: CW - 20 }, align: 'center' }).setOrigin(0.5).setDepth(50);
            const hint  = this.add.text(MX, MY + CH / 2 - 20, 'tap to flip', { fontSize: '10px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(50);
            panel.on('pointerdown', () => { [panel, typeT, nameT, hint].forEach(o => o.destroy()); showBack(); });
            this._mtrack(panel, typeT, nameT, hint);
        };

        const showBack = () => {
            const desc  = CARD_INFO[card.name] ?? 'No description available.';
            const panel = this.add.rectangle(MX, MY, CW, CH, 0x0d0d2e, 1)
                .setOrigin(0.5).setDepth(49).setStrokeStyle(3, col, 1).setInteractive({ cursor: 'pointer' });
            const nameT   = this.add.text(MX, MY - CH / 2 + 30, card.name, { fontSize: '18px', color: '#e8d5a3', fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
            const divider = this.add.rectangle(MX, MY - CH / 2 + 52, CW - 20, 1, 0x3a3a6a).setOrigin(0.5, 0).setDepth(50);
            const descT   = this.add.text(MX, MY, desc, { fontSize: '13px', color: '#cccccc', wordWrap: { width: CW - 28 }, align: 'center' }).setOrigin(0.5).setDepth(50);
            const tagT    = this.add.text(MX, MY + CH / 2 - 20, `[${card.type}]`, { fontSize: '10px', color: '#666688' }).setOrigin(0.5).setDepth(50);
            panel.on('pointerdown', () => this._clearModal());
            this._mtrack(panel, nameT, divider, descT, tagT);
        };

        showFront();
    }

    // ── discard modal ─────────────────────────────────────────────

    _showDiscardModal(me, state) {
        this._clearModal();
        this._showingModal = 'discard';
        const total  = Object.values(me.resources).reduce((a, b) => a + b, 0);
        const needed = Math.floor(total / 2);
        const disc   = { timber: 0, stone: 0, grain: 0, wool: 0, ore: 0 };
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const PW = 360, PH = 320;

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0, 0).setDepth(48);
        const panel    = this.add.rectangle(MX, MY, PW, PH, 0x0d0d2e, 1).setOrigin(0.5).setDepth(49).setStrokeStyle(2, 0x3a3a6a);
        const title    = this.add.text(MX, MY - 130, 'Discard Resources', { fontSize: '18px', color: '#e8d5a3', fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
        const subT     = this.add.text(MX, MY - 103, `Must discard: ${needed}   Selected: 0`, { fontSize: '14px', color: '#cccccc' }).setOrigin(0.5).setDepth(50);
        this._mtrack(backdrop, panel, title, subT);

        ['timber', 'stone', 'grain', 'wool', 'ore'].forEach((r, i) => {
            const ry   = MY - 65 + i * 40;
            const lbl  = this.add.text(MX - 140, ry, r.charAt(0).toUpperCase() + r.slice(1), { fontSize: '14px', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(50);
            const have = this.add.text(MX - 10,  ry, `(${me.resources[r]})`, { fontSize: '12px', color: '#777799' }).setOrigin(0, 0.5).setDepth(50);
            const minus  = this.add.text(MX + 60,  ry, '−', { fontSize: '22px', color: '#e74c3c' }).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const countT = this.add.text(MX + 90,  ry, '0', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setDepth(50);
            const plus   = this.add.text(MX + 120, ry, '+', { fontSize: '22px', color: '#2ecc71' }).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const refresh = () => {
                const sel = Object.values(disc).reduce((a, b) => a + b, 0);
                subT.setText(`Must discard: ${needed}   Selected: ${sel}`);
                subT.setColor(sel === needed ? '#2ecc71' : '#cccccc');
                countT.setText(String(disc[r]));
            };
            plus.on('pointerdown',  () => { const sel = Object.values(disc).reduce((a,b)=>a+b,0); if (sel < needed && disc[r] < me.resources[r]) { disc[r]++; refresh(); } });
            minus.on('pointerdown', () => { if (disc[r] > 0) { disc[r]--; refresh(); } });
            this._mtrack(lbl, have, minus, countT, plus);
        });

        const confirmBg = this.add.rectangle(MX, MY + 130, 160, 36, 0x2d8f5f, 1).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
        const confirmT  = this.add.text(MX, MY + 130, 'Confirm Discard', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
        confirmBg.on('pointerdown', () => {
            if (Object.values(disc).reduce((a,b)=>a+b,0) !== needed) return;
            Network.sendAction({ type: 'discard_resources', resources: { ...disc } });
            this._clearModal();
        });
        this._mtrack(confirmBg, confirmT);
    }

    // ── bank trade modal ──────────────────────────────────────────

    _showTradeModal(state) {
        this._clearModal();
        this._showingModal = 'trade';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const PW = 420, PH = 340;
        const RESOURCES = ['timber', 'stone', 'grain', 'wool', 'ore'];
        const giving    = { timber: 0, stone: 0, grain: 0, wool: 0, ore: 0 };
        const receiving = { timber: 0, stone: 0, grain: 0, wool: 0, ore: 0 };
        const redraw = () => { this._clearModal(); this._showingModal = 'trade'; buildPanel(); };

        const buildPanel = () => {
            const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0, 0).setDepth(48);
            const panel    = this.add.rectangle(MX, MY, PW, PH, 0x0d0d2e, 1).setOrigin(0.5).setDepth(49).setStrokeStyle(2, 0x3a3a6a);
            const title    = this.add.text(MX, MY - 145, 'Bank Trade (4:1)', { fontSize: '18px', color: '#e8d5a3', fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
            this._mtrack(backdrop, panel, title);

            const makeRow = (label, obj, yOff, primary) => {
                this._mtrack(this.add.text(MX - 190, MY + yOff, label, { fontSize: '13px', color: '#888899' }).setOrigin(0, 0.5).setDepth(50));
                RESOURCES.forEach((r, i) => {
                    const rx  = MX - 110 + i * 68;
                    const ry  = MY + yOff;
                    const sel = obj[r] > 0;
                    const col = sel ? (primary ? 0xc0392b : 0x2d8f5f) : 0x2c3e50;
                    const box = this.add.rectangle(rx, ry, 62, 34, col, sel ? 1 : 0.65).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
                    const t   = this.add.text(rx, ry, r.slice(0,3).toUpperCase() + (sel ? `\n${obj[r]}` : ''), { fontSize: '11px', color: '#ffffff', align: 'center' }).setOrigin(0.5).setDepth(51);
                    box.on('pointerdown', () => { RESOURCES.forEach(k => obj[k] = 0); obj[r] = primary ? 4 : 1; redraw(); });
                    this._mtrack(box, t);
                });
            };
            makeRow('GIVE (4)', giving,    -50, true);
            makeRow('GET  (1)', receiving,  30, false);

            const cancelBg = this.add.rectangle(MX - 85, MY + 130, 130, 36, 0x555555, 1).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const cancelT  = this.add.text(MX - 85, MY + 130, 'Cancel', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
            cancelBg.on('pointerdown', () => this._clearModal());
            const tradeBg = this.add.rectangle(MX + 85, MY + 130, 130, 36, 0x117a65, 1).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const tradeT  = this.add.text(MX + 85, MY + 130, 'Confirm', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
            tradeBg.on('pointerdown', () => {
                const g = Object.fromEntries(Object.entries(giving).filter(([,v])=>v>0));
                const r = Object.fromEntries(Object.entries(receiving).filter(([,v])=>v>0));
                if (Object.keys(g).length && Object.keys(r).length) {
                    Network.sendAction({ type: 'bank_trade', giving: g, receiving: r });
                    this._clearModal();
                }
            });
            this._mtrack(cancelBg, cancelT, tradeBg, tradeT);
        };
        buildPanel();
    }

    // ── harvest modal ─────────────────────────────────────────────

    _showHarvestModal(cardId) {
        this._clearModal();
        this._showingModal = 'harvest';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const RESOURCES = ['timber', 'stone', 'grain', 'wool', 'ore'];

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0, 0).setDepth(48);
        const panel    = this.add.rectangle(MX, MY, 360, 160, 0x0d0d2e, 1).setOrigin(0.5).setDepth(49).setStrokeStyle(2, 0x3a3a6a);
        const title    = this.add.text(MX, MY - 55, 'Harvest — Take 2 of:', { fontSize: '16px', color: '#e8d5a3' }).setOrigin(0.5).setDepth(50);
        this._mtrack(backdrop, panel, title);

        RESOURCES.forEach((r, i) => {
            const rx  = MX - 140 + i * 70;
            const box = this.add.rectangle(rx, MY, 62, 36, 0x2c3e50, 1).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const t   = this.add.text(rx, MY, r.slice(0,3).toUpperCase(), { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
            box.on('pointerover', () => box.setFillStyle(0x3a5a80));
            box.on('pointerout',  () => box.setFillStyle(0x2c3e50));
            box.on('pointerdown', () => { Network.sendAction({ type: 'play_card', card_id: cardId, resource: r }); this._clearModal(); });
            this._mtrack(box, t);
        });

        const cancel  = this.add.rectangle(MX, MY + 55, 100, 30, 0x555555, 1).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
        const cancelT = this.add.text(MX, MY + 55, 'Cancel', { fontSize: '13px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
        cancel.on('pointerdown', () => this._clearModal());
        this._mtrack(cancel, cancelT);
    }

    // ── player pick modal ─────────────────────────────────────────

    _showPlayerPickModal(cardId, state) {
        this._clearModal();
        this._showingModal = 'player_pick';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const others = state.player_order.filter(p => p !== this.myPlayerId);
        const PH = 80 + others.length * 48;

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0, 0).setDepth(48);
        const panel    = this.add.rectangle(MX, MY, 300, PH, 0x0d0d2e, 1).setOrigin(0.5).setDepth(49).setStrokeStyle(2, 0x3a3a6a);
        const title    = this.add.text(MX, MY - PH / 2 + 24, 'Choose a player:', { fontSize: '16px', color: '#e8d5a3' }).setOrigin(0.5).setDepth(50);
        this._mtrack(backdrop, panel, title);

        others.forEach((pid, i) => {
            const p   = state.players[pid];
            const by  = MY - PH / 2 + 62 + i * 48;
            const col = COLOR_HEX[p.color] ?? 0x555555;
            const bg  = this.add.rectangle(MX, by, 240, 36, col, 0.85).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const t   = this.add.text(MX, by, p.name, { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
            bg.on('pointerdown', () => { Network.sendAction({ type: 'play_card', card_id: cardId, target_player: pid }); this._clearModal(); });
            this._mtrack(bg, t);
        });

        const cancelBg = this.add.rectangle(MX, MY + PH / 2 - 22, 100, 30, 0x555555, 1).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
        const cancelT  = this.add.text(MX, MY + PH / 2 - 22, 'Cancel', { fontSize: '13px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
        cancelBg.on('pointerdown', () => this._clearModal());
        this._mtrack(cancelBg, cancelT);
    }

    // ── P2P trade modal ───────────────────────────────────────────

    _showP2PTradeModal(state) {
        this._clearModal();
        this._showingModal = 'p2p_trade';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const RESOURCES = ['timber', 'stone', 'grain', 'wool', 'ore'];
        const me     = state.players[this.myPlayerId];
        const others = state.player_order.filter(p => p !== this.myPlayerId);
        const offering   = { timber: 0, stone: 0, grain: 0, wool: 0, ore: 0 };
        const requesting = { timber: 0, stone: 0, grain: 0, wool: 0, ore: 0 };
        let targetPlayer = others[0] ?? null;
        const redraw = () => { this._clearModal(); this._showingModal = 'p2p_trade'; build(); };

        const build = () => {
            const PW = 460, PH = 420;
            const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0, 0).setDepth(48).setInteractive();
            backdrop.on('pointerdown', () => this._clearModal());
            const panel = this.add.rectangle(MX, MY, PW, PH, 0x0d0d2e).setOrigin(0.5).setDepth(49).setStrokeStyle(2, 0x3a3a6a);
            const title = this.add.text(MX, MY - PH / 2 + 22, 'Player Trade', { fontSize: '18px', color: '#e8d5a3', fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
            this._mtrack(backdrop, panel, title);

            this._mtrack(this.add.text(MX - PW / 2 + 16, MY - PH / 2 + 54, 'Trade with:', { fontSize: '12px', color: '#888899' }).setOrigin(0, 0.5).setDepth(50));
            others.forEach((pid, i) => {
                const p   = state.players[pid];
                const sel = pid === targetPlayer;
                const col = sel ? (COLOR_HEX[p.color] ?? 0x555555) : 0x2c3e50;
                const bx  = MX - PW / 2 + 120 + i * 100;
                const bg  = this.add.rectangle(bx, MY - PH / 2 + 54, 90, 24, col, sel ? 1 : 0.55).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
                const t   = this.add.text(bx, MY - PH / 2 + 54, p.name, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
                bg.on('pointerdown', () => { targetPlayer = pid; redraw(); });
                this._mtrack(bg, t);
            });

            const makeRow = (label, obj, yOff, mine) => {
                this._mtrack(this.add.text(MX - PW / 2 + 16, MY + yOff, label, { fontSize: '12px', color: '#888899' }).setOrigin(0, 0.5).setDepth(50));
                RESOURCES.forEach((r, i) => {
                    const rx  = MX - PW / 2 + 110 + i * 66;
                    const ry  = MY + yOff;
                    const cnt = obj[r];
                    const col = cnt > 0 ? (mine ? 0xc0392b : 0x2d8f5f) : 0x2c3e50;
                    const box = this.add.rectangle(rx, ry, 60, 32, col, cnt > 0 ? 1 : 0.55).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
                    const sub = mine ? `\n(${me.resources[r]})` : '';
                    const txt = this.add.text(rx, ry, r.slice(0,3).toUpperCase() + (cnt > 0 ? `\n×${cnt}` : sub), { fontSize: '10px', color: '#ffffff', align: 'center' }).setOrigin(0.5).setDepth(51);
                    box.on('pointerdown', () => { obj[r] = mine ? Math.min(obj[r]+1, me.resources[r]) : Math.min(obj[r]+1, 9); redraw(); });
                    box.on('rightdown',   () => { obj[r] = Math.max(0, obj[r]-1); redraw(); });
                    this._mtrack(box, txt);
                });
            };
            makeRow('You give:',    offering,   -90, true);
            makeRow('You receive:', requesting, -20, false);
            this._mtrack(this.add.text(MX, MY + 45, 'Left-click to add  ·  Right-click to remove', { fontSize: '10px', color: '#555577' }).setOrigin(0.5).setDepth(50));

            const cancelBg = this.add.rectangle(MX - 85, MY + PH/2-28, 130, 32, 0x555555).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const cancelT  = this.add.text(MX - 85, MY + PH/2-28, 'Cancel', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
            cancelBg.on('pointerdown', () => this._clearModal());
            const sendBg = this.add.rectangle(MX + 85, MY + PH/2-28, 130, 32, 0x2d8f5f).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const sendT  = this.add.text(MX + 85, MY + PH/2-28, 'Propose', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
            sendBg.on('pointerdown', () => {
                if (!targetPlayer) return;
                const off = Object.fromEntries(Object.entries(offering).filter(([,v])=>v>0));
                const req = Object.fromEntries(Object.entries(requesting).filter(([,v])=>v>0));
                if (!Object.keys(off).length && !Object.keys(req).length) return;
                Network.sendAction({ type: 'propose_trade', to_player: targetPlayer, offering: off, requesting: req });
                this._clearModal();
            });
            this._mtrack(cancelBg, cancelT, sendBg, sendT);
        };
        build();
    }

    // ── trade response modal ──────────────────────────────────────

    _showTradeResponseModal(trade, state) {
        this._clearModal();
        this._showingModal = 'trade_response';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const proposer = state.players[trade.from_player];
        const PW = 380, PH = 280;
        const fmt = (obj) => Object.entries(obj).filter(([,v])=>v>0).map(([r,v])=>`${v} ${r}`).join(', ') || 'nothing';

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0, 0).setDepth(48);
        const panel    = this.add.rectangle(MX, MY, PW, PH, 0x0d0d2e).setOrigin(0.5).setDepth(49).setStrokeStyle(2, 0x3a3a6a);
        const title    = this.add.text(MX, MY - PH/2+22, `Trade offer from ${proposer?.name ?? '?'}`, { fontSize: '15px', color: '#e8d5a3', fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
        const offerT   = this.add.text(MX, MY - 55, `They offer:  ${fmt(trade.offering)}`,   { fontSize: '14px', color: '#2ecc71', wordWrap: { width: PW-30 }, align: 'center' }).setOrigin(0.5).setDepth(50);
        const wantT    = this.add.text(MX, MY - 10, `They want:   ${fmt(trade.requesting)}`, { fontSize: '14px', color: '#e74c3c', wordWrap: { width: PW-30 }, align: 'center' }).setOrigin(0.5).setDepth(50);
        this._mtrack(backdrop, panel, title, offerT, wantT);

        const rejectBg = this.add.rectangle(MX - 85, MY + PH/2-28, 130, 32, 0xc0392b).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
        const rejectT  = this.add.text(MX - 85, MY + PH/2-28, 'Reject', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
        rejectBg.on('pointerdown', () => { Network.sendAction({ type: 'respond_trade', accept: false }); this._clearModal(); });
        const acceptBg = this.add.rectangle(MX + 85, MY + PH/2-28, 130, 32, 0x2d8f5f).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
        const acceptT  = this.add.text(MX + 85, MY + PH/2-28, 'Accept', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(51);
        acceptBg.on('pointerdown', () => { Network.sendAction({ type: 'respond_trade', accept: true }); this._clearModal(); });
        this._mtrack(rejectBg, rejectT, acceptBg, acceptT);
    }
}
