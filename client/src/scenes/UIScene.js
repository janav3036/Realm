import Phaser from 'phaser';
import Network from '../network.js';

// ── Palette ───────────────────────────────────────────────────────
const C = {
    void:      0x07060f,
    deep:      0x0a0918,
    panel:     0x111020,
    gold:      0xc9a227,
    goldDim:   0x5a4010,
    parchment: '#e8dcc8',
    goldS:     '#c9a227',
    goldBrS:   '#f4d97b',
    dimS:      '#7a7060',
    goldDimS:  '#5a4010',
};

const PLAYER_CSS = { red: '#c41e3a', blue: '#3a7bd5', green: '#27ae60', orange: '#e67e22' };
const PLAYER_HEX = { red: 0xc41e3a, blue: 0x3a7bd5, green: 0x27ae60, orange: 0xe67e22 };

const CARD_BG = {
    action:    0x0d1828,
    structure: 0x180d28,
    vp:        0x1e1600,
    event:     0x220d0d,
};
const CARD_ACCENT = {
    action:    0x2255aa,
    structure: 0x7a22cc,
    vp:        0xc9a227,
    event:     0xaa2222,
};
const CARD_ACCENT_S = {
    action:    '#2255aa',
    structure: '#7a22cc',
    vp:        '#c9a227',
    event:     '#aa2222',
};

const COSTS = {
    road:       '1 Timber · 1 Stone',
    settlement: '1 Timber · 1 Stone · 1 Grain · 1 Wool',
    city:       '3 Ore · 2 Grain',
    buy_card:   '1 Ore · 1 Grain · 1 Wool',
};

const CARD_INFO = {
    'Harvest':       'Take 2 of any one resource from the bank.',
    'Plunder':       'Steal 1 resource from any player — no robber required.',
    'Sabotage':      'Move the robber to any hex and steal. Counts toward Largest Army.',
    'Caravan':       'Make one bank trade at 2:1 for any resource this turn.',
    'Reinforce':     'Place 1 free road connected to your existing network.',
    'Militia':       'Block one player from building any structures this turn.',
    'Surplus':       'All your settlements and cities produce +1 resource this turn.',
    'Watchtower':    "Attach to a settlement — see one opponent's full hand at all times.",
    'Granary':       'Attach to a settlement — it produces even with the robber present.',
    'Forge':         'Attach to a city on an Ore hex — it produces +1 Ore each roll.',
    'Harbour':       'Attach to a settlement — it acts as a 3:1 port.',
    'Barracks':      'Attach to a settlement — you are immune to Militia cards.',
    'Drought':       'EVENT: No Grain is produced next round for anyone.',
    'Gold Rush':     'EVENT: All players immediately collect 1 Ore.',
    'Earthquake':    'EVENT: All roads touching one randomly chosen hex are removed.',
    'Festival':      'EVENT: All players immediately draw 2 extra cards.',
    'Plague':        'EVENT: All players holding 6+ resources must discard 2.',
    'Victory Point': '+1 Victory Point. A secret kept until the final hour.',
};

const PHASE_LABEL = {
    setup_s1:   'Place your Keep',
    setup_s2:   'Place your Keep',
    setup_road: 'Lay the First Road',
    draw:       'Draw a Decree',
    roll:       'Cast the Dice',
    action:     'Act, Trade, or Build',
    robber:     'Unleash the Robber',
    discard:    'Offer to the Realm',
};

const SBAR = 224;

// Helper: integer colour → CSS hex string
const i2s = (n) => '#' + n.toString(16).padStart(6, '0');

export default class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene' }); }

    init() {
        this.myPlayerId      = null;
        this.gameState       = null;
        this._dynItems       = [];
        this._modalItems     = [];
        this._showingModal   = null;
        this._collapsed      = false;
        this._stateHandler   = this._onStateUpdate.bind(this);
        this._registryHandler = null;
        this.isMobile            = false;
        this._mHud               = null;
        this._mTab               = 'decree';
        this._orientationHandler = null;
    }

    create() {
        this.myPlayerId = this.registry.get('myPlayerId');
        this.isMobile   = ('ontouchstart' in window && window.innerWidth <= 900)
                        || !!(window.matchMedia?.('(pointer: coarse)').matches);
        const { width, height } = this.scale;

        if (!this.isMobile) {
            // Sidebar background
            this._sidebarBg = this.add.rectangle(width - SBAR, 0, SBAR, height, C.deep, 0.97)
                .setOrigin(0, 0).setDepth(19);

            // Left-edge gold border line
            this._borderGfx = this.add.graphics().setDepth(20);
            this._drawBorder(width, height);

            // Collapse tab
            this._tabBg = this.add.rectangle(width - SBAR - 18, height / 2, 20, 52, C.deep, 0.9)
                .setOrigin(0, 0.5).setDepth(20)
                .setStrokeStyle(1, C.goldDim, 0.5)
                .setInteractive({ cursor: 'pointer' });
            this._tabArrow = this.add.text(width - SBAR - 8, height / 2, '»', {
                fontFamily: '"Cinzel", Georgia, serif',
                fontSize: '12px',
                color: C.goldDimS,
            }).setOrigin(0.5).setDepth(21).setInteractive({ cursor: 'pointer' });

            this._tabBg.on('pointerdown',    () => this._toggleSidebar());
            this._tabArrow.on('pointerdown', () => this._toggleSidebar());
        } else {
            this._initMobileHUD();
            this._orientationHandler = this._onOrientationChange.bind(this);
            window.addEventListener('resize', this._orientationHandler);
            this._onOrientationChange();
            this.registry.events.on('changedata-buildMode', () => {
                if (this.gameState) this._renderMobileTab(this._mTab, this.gameState);
            });
        }

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
        if (this._orientationHandler) {
            window.removeEventListener('resize', this._orientationHandler);
            this._orientationHandler = null;
        }
        if (this.isMobile) this._removeMobileHUD();
    }

    _drawBorder(width, height) {
        this._borderGfx.clear();
        const sx = width - SBAR;
        // Primary gold border
        this._borderGfx.lineStyle(1, C.gold, 0.45);
        this._borderGfx.lineBetween(sx, 0, sx, height);
        // Inset subtle line
        this._borderGfx.lineStyle(1, C.gold, 0.1);
        this._borderGfx.lineBetween(sx + 4, 0, sx + 4, height);
    }

    // ── sidebar toggle ────────────────────────────────────────────

    _toggleSidebar() {
        if (this.isMobile) return;
        this._collapsed = !this._collapsed;
        const { width, height } = this.scale;
        if (this._collapsed) {
            this._sidebarBg.setVisible(false);
            this._borderGfx.setVisible(false);
            this._tabBg.setX(width - 18);
            this._tabArrow.setX(width - 8).setText('«');
        } else {
            this._sidebarBg.setVisible(true);
            this._borderGfx.setVisible(true);
            this._tabBg.setX(width - SBAR - 18);
            this._tabArrow.setX(width - SBAR - 8).setText('»');
        }
        if (this.gameState) this._renderDynamic();
    }

    // ── state update ──────────────────────────────────────────────

    _onStateUpdate(state) {
        if (!state?.board) return;
        if (state.game_over || state.winner) { this.scene.stop(); return; }
        this.gameState = state;
        this._renderDynamic();
    }

    // ── dynamic render ────────────────────────────────────────────

    _clearDyn()   { this._dynItems.forEach(o => o.destroy());   this._dynItems = []; }
    _clearModal() { this._modalItems.forEach(o => o.destroy()); this._modalItems = []; this._showingModal = null; }
    _dtrack(...items) { this._dynItems.push(...items); }
    _mtrack(...items) { this._modalItems.push(...items); }

    _renderDynamic() {
        this._clearDyn();
        if (!this.isMobile && this._collapsed) return;

        if (this.isMobile) {
            this._updateMobileHUD(this.gameState);
            const mustDiscard = this.gameState.turn.must_discard ?? [];
            if (mustDiscard.includes(this.myPlayerId) && this._showingModal !== 'discard') {
                this._showDiscardModal(this.gameState.players[this.myPlayerId], this.gameState);
            } else if (!mustDiscard.includes(this.myPlayerId) && this._showingModal === 'discard') {
                this._clearModal();
            }
            const trade = this.gameState.turn.active_trade;
            if (trade && trade.to_player === this.myPlayerId && trade.status === 'pending'
                && this._showingModal !== 'trade_response') {
                this._showTradeResponseModal(trade, this.gameState);
            } else if (this._showingModal === 'trade_response'
                && (!trade || trade.to_player !== this.myPlayerId || trade.status !== 'pending')) {
                this._clearModal();
            }
            return;
        }

        const state    = this.gameState;
        const me       = state.players[this.myPlayerId];
        const isMyTurn = state.turn.current_player === this.myPlayerId;
        const phase    = state.turn.phase;
        const { width, height } = this.scale;
        const SX = width - SBAR;
        const SC = SX + SBAR / 2;

        let sy = 14;
        sy = this._renderTurnInfo(state, SX, SC, sy);
        sy = this._renderResources(me, SX, SC, sy);
        sy = this._renderCards(me, state, SX, SC, sy);

        if (isMyTurn) {
            this._renderActions(phase, state, SX, SC);
        } else {
            this._dtrack(
                this.add.text(SC, height - 110, 'Awaiting your\nfellow lords…', {
                    fontFamily: '"IM Fell English SC", Georgia, serif',
                    fontSize: '11px',
                    color: C.goldDimS,
                    align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        }

        this._renderExitBtn(SX, SC, height);

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

    // ── helpers ───────────────────────────────────────────────────

    _divider(gfx, SX, y) {
        gfx.lineStyle(1, C.goldDim, 0.35);
        gfx.lineBetween(SX + 18, y, SX + SBAR - 18, y);
    }

    _sLabel(SC, y, txt) {
        const t = this.add.text(SC, y, txt, {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '7px',
            color: C.goldDimS,
            letterSpacing: 5,
        }).setOrigin(0.5, 0).setDepth(21);
        this._dtrack(t);
        return y + 13;
    }

    _mkBtn(x, y, w, h, label, accentHex, cb, isActive = false) {
        const bg = this.add.rectangle(x, y, w, h, isActive ? 0x1a1628 : C.void, 1)
            .setOrigin(0, 0)
            .setStrokeStyle(1, isActive ? C.gold : accentHex, isActive ? 0.8 : 0.55)
            .setDepth(21)
            .setInteractive({ cursor: 'pointer' });
        const t = this.add.text(x + w / 2, y + h / 2, label, {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '9px',
            color: isActive ? C.goldBrS : i2s(accentHex),
            letterSpacing: 1,
        }).setOrigin(0.5).setDepth(22);
        bg.on('pointerover', () => bg.setFillStyle(0x1a1628));
        bg.on('pointerout',  () => bg.setFillStyle(isActive ? 0x1a1628 : C.void));
        bg.on('pointerdown', cb);
        this._dtrack(bg, t);
        return { bg, t };
    }

    _mkModalBg(MX, MY, w, h, titleStr) {
        const { width, height } = this.scale;
        const hh = h / 2, hw = w / 2;

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.72)
            .setOrigin(0, 0).setDepth(48).setInteractive();
        const panel = this.add.rectangle(MX, MY, w, h, C.deep, 1)
            .setOrigin(0.5).setDepth(49)
            .setStrokeStyle(1, C.gold, 0.5);
        // Inner inset frame
        const inner = this.add.rectangle(MX, MY, w - 10, h - 10, 0, 0)
            .setOrigin(0.5).setDepth(49)
            .setStrokeStyle(1, C.goldDim, 0.25);
        // Corner ornaments
        [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].forEach(([ox, oy]) => {
            this._mtrack(
                this.add.text(MX + ox, MY + oy, '◆', {
                    fontFamily: 'serif', fontSize: '8px', color: C.goldS,
                }).setOrigin(0.5).setAlpha(0.35).setDepth(50)
            );
        });
        // Title
        const titleT = this.add.text(MX, MY - hh + 26, titleStr, {
            fontFamily: '"Cinzel Decorative", Georgia, serif',
            fontSize: '15px',
            color: C.goldS,
        }).setOrigin(0.5).setDepth(50);
        // Title rule
        const ruleGfx = this.add.graphics().setDepth(50);
        ruleGfx.lineStyle(1, C.goldDim, 0.55);
        ruleGfx.lineBetween(MX - hw + 24, MY - hh + 44, MX + hw - 24, MY - hh + 44);

        this._mtrack(backdrop, panel, inner, titleT, ruleGfx);
        return { backdrop, topContentY: MY - hh + 50 };
    }

    // ── turn info ─────────────────────────────────────────────────

    _renderTurnInfo(state, SX, SC, sy) {
        const turn  = state.turn;
        const cp    = state.players[turn.current_player];
        const mine  = turn.current_player === this.myPlayerId;
        const label = PHASE_LABEL[turn.phase] ?? turn.phase;
        const col   = mine ? C.goldS : (PLAYER_CSS[cp?.color] ?? C.parchment);
        const gfx   = this.add.graphics().setDepth(21);

        this._dtrack(
            gfx,
            this.add.text(SC, sy, mine ? '▶  Your Turn' : (cp?.name ?? '?'), {
                fontFamily: '"Cinzel", Georgia, serif',
                fontSize: '13px',
                color: col,
                fontStyle: mine ? 'bold' : 'normal',
            }).setOrigin(0.5, 0).setDepth(21),
            this.add.text(SC, sy + 18, label, {
                fontFamily: '"IM Fell English SC", Georgia, serif',
                fontSize: '10px',
                color: mine ? C.goldDimS : C.dimS,
            }).setOrigin(0.5, 0).setDepth(21),
        );
        sy += 36;

        if (turn.dice) {
            const [d1, d2] = turn.dice;
            this._dtrack(
                this.add.text(SC, sy, `⚄  ${d1} + ${d2}  =  ${turn.dice_total}`, {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '12px',
                    color: turn.dice_total === 7 ? '#c41e3a' : C.parchment,
                    letterSpacing: 1,
                }).setOrigin(0.5, 0).setDepth(21)
            );
            sy += 16;

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
                    : 'No harvest';
                this._dtrack(
                    this.add.text(SC, sy, line, {
                        fontFamily: '"IM Fell English SC", Georgia, serif',
                        fontSize: '10px',
                        color: '#7ab87a',
                    }).setOrigin(0.5, 0).setDepth(21)
                );
                sy += 14;
            }
        }
        sy += 4;

        // Scoreboard
        gfx.lineStyle(1, C.goldDim, 0.3);
        gfx.lineBetween(SX + 18, sy, SX + SBAR - 18, sy);
        sy += 6;

        state.player_order.forEach(pid => {
            const p  = state.players[pid];
            const vp = p.victory_points + p.vp_cards
                + (state.longest_road_owner === pid ? 2 : 0)
                + (state.largest_army_owner === pid ? 2 : 0);
            const marker = pid === this.myPlayerId ? '◆ ' : '    ';
            this._dtrack(
                this.add.text(SC, sy, `${marker}${p.name}  ${vp} ✦`, {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '10px',
                    color: PLAYER_CSS[p.color] ?? C.parchment,
                    letterSpacing: 1,
                }).setOrigin(0.5, 0).setDepth(21)
            );
            sy += 14;
        });

        sy += 4;
        gfx.lineStyle(1, C.goldDim, 0.3);
        gfx.lineBetween(SX + 18, sy, SX + SBAR - 18, sy);
        // Center diamond on divider
        this._dtrack(
            this.add.text(SC, sy, '◆', {
                fontFamily: 'serif', fontSize: '7px', color: C.goldDimS,
            }).setOrigin(0.5).setAlpha(0.45).setDepth(22)
        );

        return sy + 10;
    }

    // ── resources ─────────────────────────────────────────────────

    _renderResources(me, SX, SC, sy) {
        const RESOURCES = [
            { key: 'timber', abbr: 'TIM', col: 0x0e2b0e, colS: '#1a5c1a' },
            { key: 'stone',  abbr: 'STN', col: 0x1a1a1a, colS: '#555555' },
            { key: 'grain',  abbr: 'GRN', col: 0x2b2000, colS: '#7a5a00' },
            { key: 'wool',   abbr: 'WOL', col: 0x0a2a15, colS: '#256a38' },
            { key: 'ore',    abbr: 'ORE', col: 0x0d0d1e, colS: '#2e2e6a' },
        ];
        const BW = 36, BH = 46, GAP = 3;
        const totalW = 5 * BW + 4 * GAP;
        const startX = SX + (SBAR - totalW) / 2;

        sy = this._sLabel(SC, sy, 'COFFERS');

        RESOURCES.forEach((r, i) => {
            const x     = startX + i * (BW + GAP);
            const count = me?.resources[r.key] ?? 0;
            const gfx   = this.add.graphics().setDepth(21);
            // Tile background with subtle border
            gfx.fillStyle(r.col, 1);
            gfx.fillRect(x, sy, BW, BH);
            gfx.lineStyle(1, count > 0 ? C.goldDim : 0x2a2030, 0.7);
            gfx.strokeRect(x, sy, BW, BH);

            this._dtrack(
                gfx,
                this.add.text(x + BW / 2, sy + 8, r.abbr, {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '7px',
                    color: count > 0 ? '#7a6a3a' : '#3a2e18',
                    letterSpacing: 1,
                }).setOrigin(0.5, 0).setDepth(22),
                this.add.text(x + BW / 2, sy + 20, String(count), {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '17px',
                    color: count > 0 ? C.parchment : '#3a2e18',
                    fontStyle: 'bold',
                }).setOrigin(0.5, 0).setDepth(22)
            );
        });

        return sy + BH + 10;
    }

    // ── card hand ─────────────────────────────────────────────────

    _renderCards(me, state, SX, SC, sy) {
        const hand     = me?.hand ?? [];
        const CW = 56, CH = 72, GAP = 4, COLS = 3;
        const totalW   = COLS * CW + (COLS - 1) * GAP;
        const startX   = SX + (SBAR - totalW) / 2;
        const isMyTurn = state.turn.current_player === this.myPlayerId;
        const phase    = state.turn.phase;

        // Section divider + label
        const gfxDiv = this.add.graphics().setDepth(21);
        this._divider(gfxDiv, SX, sy);
        this._dtrack(gfxDiv,
            this.add.text(SC, sy, '◆', {
                fontFamily: 'serif', fontSize: '7px', color: C.goldDimS,
            }).setOrigin(0.5).setAlpha(0.45).setDepth(22)
        );
        sy += 10;
        sy = this._sLabel(SC, sy, `HAND  (${hand.length})`);

        hand.forEach((card, i) => {
            const row    = Math.floor(i / COLS);
            const colIdx = i % COLS;
            const x      = startX + colIdx * (CW + GAP);
            const y      = sy + row * (CH + GAP);
            const canPlay = isMyTurn && phase === 'action' && card.type !== 'vp';
            const bgCol   = CARD_BG[card.type]    ?? 0x0d0c1a;
            const accent  = CARD_ACCENT[card.type] ?? 0x3a3a6a;
            const accentS = CARD_ACCENT_S[card.type] ?? '#3a3a6a';

            // Card background
            const gfx = this.add.graphics().setDepth(21);
            gfx.fillStyle(bgCol, canPlay ? 1 : 0.45);
            gfx.fillRect(x, y, CW, CH);
            // Outer border
            gfx.lineStyle(1, accent, canPlay ? 0.75 : 0.2);
            gfx.strokeRect(x, y, CW, CH);
            // Inner inset border (tarot frame)
            gfx.lineStyle(1, accent, canPlay ? 0.2 : 0.07);
            gfx.strokeRect(x + 3, y + 3, CW - 6, CH - 6);

            const nm = this.add.text(x + CW / 2, y + CH / 2, card.name, {
                fontFamily: '"Cinzel", Georgia, serif',
                fontSize: '8px',
                color: canPlay ? C.parchment : '#3a2e28',
                wordWrap: { width: CW - 6 },
                align: 'center',
            }).setOrigin(0.5).setDepth(22);

            const typeT = this.add.text(x + CW / 2, y + CH - 10, card.type.slice(0, 3).toUpperCase(), {
                fontFamily: '"Cinzel", Georgia, serif',
                fontSize: '6px',
                color: canPlay ? accentS : '#2a2030',
                letterSpacing: 1,
            }).setOrigin(0.5, 1).setDepth(22);

            // Top ornament
            const orn = this.add.text(x + CW / 2, y + 8, '✦', {
                fontFamily: 'serif', fontSize: '7px', color: accentS,
            }).setOrigin(0.5).setAlpha(canPlay ? 0.5 : 0.15).setDepth(22);

            this._dtrack(gfx, nm, typeT, orn);

            let pressTimer = null;
            gfx.setInteractive(new Phaser.Geom.Rectangle(x, y, CW, CH), Phaser.Geom.Rectangle.Contains);
            gfx.on('pointerdown', () => {
                pressTimer = this.time.delayedCall(500, () => { pressTimer = null; this._showCardPopup(card); });
            });
            gfx.on('pointerup', () => {
                if (pressTimer) { pressTimer.remove(); pressTimer = null; if (canPlay) this._playCard(card, state); }
            });
            gfx.on('pointerover', () => gfx.setAlpha(canPlay ? 0.75 : 1));
            gfx.on('pointerout',  () => {
                gfx.setAlpha(1);
                if (pressTimer) { pressTimer.remove(); pressTimer = null; }
            });
        });

        const rows = Math.ceil(Math.max(hand.length, 1) / COLS);
        return sy + rows * (CH + GAP) + 10;
    }

    // ── action buttons ────────────────────────────────────────────

    _renderActions(phase, state, SX, SC) {
        const { height } = this.scale;
        const BW2  = Math.floor((SBAR - 24) / 2);
        const BH   = 26, GAP = 4;
        const x1   = SX + 10;
        const x2   = SX + 10 + BW2 + GAP;
        const FW   = SBAR - 20;
        const bMode = this.registry.get('buildMode');
        let by = height - 40;

        const cost = (x, y, key, full = false) => {
            const w = full ? FW : BW2;
            this._dtrack(
                this.add.text(x + w / 2, y + BH + 2, COSTS[key], {
                    fontFamily: '"IM Fell English SC", Georgia, serif',
                    fontSize: '7px',
                    color: C.goldDimS,
                }).setOrigin(0.5, 0).setDepth(22)
            );
        };

        if (phase === 'draw') {
            by -= BH;
            this._mkBtn(x1, by, FW, BH, '✦  DRAW A DECREE', C.gold, () => Network.sendAction({ type: 'draw_card' }));

        } else if (phase === 'roll') {
            by -= BH;
            this._mkBtn(x1, by, FW, BH, '⚄  CAST THE DICE', 0x2d8f5f, () => Network.sendAction({ type: 'roll_dice' }));

        } else if (phase === 'action') {
            // End turn
            by -= BH;
            this._mkBtn(x1, by, FW, BH, 'END TURN', 0x8b1520, () => {
                Network.sendAction({ type: 'end_turn' });
                this.registry.set('buildMode', null);
            });
            // Bank + P2P row
            by -= BH + GAP + 6;
            this._mkBtn(x1, by, BW2, BH, 'BANK',      0x117a65, () => this._showTradeModal(state));
            this._mkBtn(x2, by, BW2, BH, 'P2P TRADE', 0x2471a3, () => this._showP2PTradeModal(state));
            // City + Buy Card row
            by -= BH + GAP + 14;
            this._mkBtn(x1, by, BW2, BH, 'CITY',     bMode === 'city'       ? C.gold : 0x5a4010, () => this._toggleBuild('city'),       bMode === 'city');
            cost(x1, by, 'city');
            this._mkBtn(x2, by, BW2, BH, 'BUY CARD', 0x6c3483, () => Network.sendAction({ type: 'buy_extra_card' }));
            cost(x2, by, 'buy_card');
            // Road + Settlement row
            by -= BH + GAP + 14;
            this._mkBtn(x1, by, BW2, BH, 'ROAD',       bMode === 'road'       ? C.gold : 0x5a4010, () => this._toggleBuild('road'),       bMode === 'road');
            cost(x1, by, 'road');
            this._mkBtn(x2, by, BW2, BH, 'SETTLEMENT', bMode === 'settlement' ? C.gold : 0x5a4010, () => this._toggleBuild('settlement'), bMode === 'settlement');
            cost(x2, by, 'settlement');

        } else if (phase === 'setup_s1' || phase === 'setup_s2') {
            by -= 38;
            this._dtrack(
                this.add.text(SC, by, 'Choose a vertex to\nplace your settlement', {
                    fontFamily: '"IM Fell English", Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '11px',
                    color: C.goldDimS,
                    align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        } else if (phase === 'setup_road') {
            by -= 34;
            this._dtrack(
                this.add.text(SC, by, 'Choose an edge to\nlay your road', {
                    fontFamily: '"IM Fell English", Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '11px',
                    color: C.goldDimS,
                    align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        } else if (phase === 'robber') {
            by -= 34;
            this._dtrack(
                this.add.text(SC, by, 'Choose a hex to\nunleash the Robber', {
                    fontFamily: '"IM Fell English", Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '11px',
                    color: '#8b1520',
                    align: 'center',
                }).setOrigin(0.5, 0).setDepth(21)
            );
        }
    }

    _renderExitBtn(SX, SC, height) {
        const isHost = !!this.registry.get('isHost');
        const label  = isHost ? 'END GAME' : 'RETREAT';
        const y      = height - 10;
        const bg = this.add.rectangle(SX + 10, y, SBAR - 20, 22, C.void, 1)
            .setOrigin(0, 1).setDepth(21)
            .setStrokeStyle(1, 0x5a1010, 0.6)
            .setInteractive({ cursor: 'pointer' });
        const t = this.add.text(SC, y - 11, label, {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '8px',
            color: '#6a1a1a',
            letterSpacing: 3,
        }).setOrigin(0.5).setDepth(22);
        bg.on('pointerover', () => { bg.setStrokeStyle(1, 0xc0392b, 0.7); t.setColor('#c0392b'); });
        bg.on('pointerout',  () => { bg.setStrokeStyle(1, 0x5a1010, 0.6); t.setColor('#6a1a1a'); });
        bg.on('pointerdown', () => { if (isHost) Network.endGame(); else Network.quitGame(); });
        this._dtrack(bg, t);
    }

    // ── build mode ────────────────────────────────────────────────

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
        const CW = 200, CH = 330;
        const bgCol   = CARD_BG[card.type]    ?? 0x0d0c1a;
        const accent  = CARD_ACCENT[card.type] ?? 0x3a3a6a;
        const accentS = CARD_ACCENT_S[card.type] ?? '#3a3a6a';
        const hh = CH / 2, hw = CW / 2;

        const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.65)
            .setOrigin(0, 0).setDepth(48).setInteractive();
        backdrop.on('pointerdown', () => this._clearModal());
        this._mtrack(backdrop);

        const showFront = () => {
            const gfx = this.add.graphics().setDepth(49);
            gfx.fillStyle(bgCol, 1);
            gfx.fillRect(MX - hw, MY - hh, CW, CH);
            gfx.lineStyle(1, accent, 0.8);
            gfx.strokeRect(MX - hw, MY - hh, CW, CH);
            gfx.lineStyle(1, accent, 0.2);
            gfx.strokeRect(MX - hw + 5, MY - hh + 5, CW - 10, CH - 10);

            const topOrn  = this.add.text(MX, MY - hh + 22, '✦', { fontFamily: 'serif', fontSize: '14px', color: accentS }).setOrigin(0.5).setDepth(50).setAlpha(0.6);
            const typeT   = this.add.text(MX, MY - hh + 44, card.type.toUpperCase(), {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: accentS, letterSpacing: 4,
            }).setOrigin(0.5).setDepth(50).setAlpha(0.7);
            const nameT   = this.add.text(MX, MY, card.name, {
                fontFamily: '"Cinzel Decorative", Georgia, serif', fontSize: '22px', color: C.parchment,
                wordWrap: { width: CW - 28 }, align: 'center',
            }).setOrigin(0.5).setDepth(50);
            const botOrn  = this.add.text(MX, MY + hh - 30, '✦', { fontFamily: 'serif', fontSize: '12px', color: accentS }).setOrigin(0.5).setDepth(50).setAlpha(0.5);
            const hint    = this.add.text(MX, MY + hh - 14, 'tap to reveal', {
                fontFamily: '"IM Fell English SC", Georgia, serif', fontSize: '9px', color: '#3a2e18',
            }).setOrigin(0.5).setDepth(50);

            const all = [gfx, topOrn, typeT, nameT, botOrn, hint];
            gfx.setInteractive(new Phaser.Geom.Rectangle(MX - hw, MY - hh, CW, CH), Phaser.Geom.Rectangle.Contains);
            gfx.on('pointerdown', () => {
                this.tweens.add({ targets: all, scaleX: 0, duration: 130, ease: 'Power2',
                    onComplete: () => { all.forEach(o => o.destroy()); showBack(); }
                });
            });
            all.forEach(o => o.setAlpha ? o.setAlpha(o.alpha) : null);
            // Entrance
            all.forEach(o => o.setScale ? o.setScale(0, 1) : null);
            this.tweens.add({ targets: all, scaleX: 1, duration: 200, ease: 'Back.easeOut' });
            this._mtrack(...all);
        };

        const showBack = () => {
            const desc = CARD_INFO[card.name] ?? 'No lore recorded.';
            const gfx  = this.add.graphics().setDepth(49);
            gfx.fillStyle(C.deep, 1);
            gfx.fillRect(MX - hw, MY - hh, CW, CH);
            gfx.lineStyle(1, accent, 0.75);
            gfx.strokeRect(MX - hw, MY - hh, CW, CH);
            gfx.lineStyle(1, accent, 0.2);
            gfx.strokeRect(MX - hw + 5, MY - hh + 5, CW - 10, CH - 10);

            const nameT = this.add.text(MX, MY - hh + 30, card.name, {
                fontFamily: '"Cinzel Decorative", Georgia, serif', fontSize: '16px', color: C.goldS,
            }).setOrigin(0.5).setDepth(50);
            const ruleGfx = this.add.graphics().setDepth(50);
            ruleGfx.lineStyle(1, C.goldDim, 0.6);
            ruleGfx.lineBetween(MX - hw + 20, MY - hh + 52, MX + hw - 20, MY - hh + 52);
            const descT = this.add.text(MX, MY - 10, desc, {
                fontFamily: '"IM Fell English", Georgia, serif', fontStyle: 'italic',
                fontSize: '13px', color: '#b8a898',
                wordWrap: { width: CW - 32 }, align: 'center',
            }).setOrigin(0.5).setDepth(50);
            const tagT  = this.add.text(MX, MY + hh - 18, `[ ${card.type} ]`, {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: C.goldDimS, letterSpacing: 3,
            }).setOrigin(0.5).setDepth(50);

            const all = [gfx, nameT, ruleGfx, descT, tagT];
            all.forEach(o => o.setScale ? o.setScale(0, 1) : null);
            this.tweens.add({ targets: all, scaleX: 1, duration: 200, ease: 'Back.easeOut' });
            gfx.setInteractive(new Phaser.Geom.Rectangle(MX - hw, MY - hh, CW, CH), Phaser.Geom.Rectangle.Contains);
            gfx.on('pointerdown', () => this._clearModal());
            this._mtrack(...all);
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
        const PW = 360, PH = 360;

        const { backdrop, topContentY } = this._mkModalBg(MX, MY, PW, PH, 'Offer to the Realm');
        backdrop.on('pointerdown', () => {});

        let selCount = 0;
        const subT = this.add.text(MX, topContentY + 2,
            `Must offer: ${needed}  ·  Selected: 0`, {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '12px', color: C.parchment,
            }).setOrigin(0.5).setDepth(50);
        this._mtrack(subT);

        ['timber', 'stone', 'grain', 'wool', 'ore'].forEach((r, i) => {
            const ry  = topContentY + 44 + i * 40;
            const lbl = this.add.text(MX - 140, ry, r[0].toUpperCase() + r.slice(1), {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '12px', color: C.parchment,
            }).setOrigin(0, 0.5).setDepth(50);
            const have = this.add.text(MX - 10, ry, `(${me.resources[r]})`, {
                fontFamily: '"IM Fell English SC", Georgia, serif', fontSize: '11px', color: C.goldDimS,
            }).setOrigin(0, 0.5).setDepth(50);
            const minus  = this.add.text(MX + 60, ry, '−', {
                fontFamily: 'serif', fontSize: '22px', color: '#8b1520',
            }).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });
            const countT = this.add.text(MX + 90, ry, '0', {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '14px', color: C.parchment,
            }).setOrigin(0.5).setDepth(50);
            const plus   = this.add.text(MX + 120, ry, '+', {
                fontFamily: 'serif', fontSize: '22px', color: '#27ae60',
            }).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });

            const refresh = () => {
                selCount = Object.values(disc).reduce((a, b) => a + b, 0);
                subT.setText(`Must offer: ${needed}  ·  Selected: ${selCount}`);
                subT.setColor(selCount === needed ? '#27ae60' : C.parchment);
                countT.setText(String(disc[r]));
            };
            plus.on('pointerdown', () => {
                const sel = Object.values(disc).reduce((a,b)=>a+b,0);
                if (sel < needed && disc[r] < me.resources[r]) { disc[r]++; refresh(); }
            });
            minus.on('pointerdown', () => { if (disc[r] > 0) { disc[r]--; refresh(); } });
            this._mtrack(lbl, have, minus, countT, plus);
        });

        const confirmBg = this.add.rectangle(MX, MY + PH/2 - 30, 180, 32, C.void, 1)
            .setOrigin(0.5).setDepth(50)
            .setStrokeStyle(1, 0x2d8f5f, 0.7)
            .setInteractive({ cursor: 'pointer' });
        const confirmT = this.add.text(MX, MY + PH/2 - 30, 'CONFIRM OFFERING', {
            fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: '#27ae60', letterSpacing: 2,
        }).setOrigin(0.5).setDepth(51);
        confirmBg.on('pointerover', () => confirmBg.setFillStyle(0x0d2a1a));
        confirmBg.on('pointerout',  () => confirmBg.setFillStyle(C.void));
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
        const caravanActive = state.turn?.caravan_active ?? false;
        const redraw = () => { this._clearModal(); this._showingModal = 'trade'; buildPanel(); };

        const buildPanel = () => {
            const { backdrop, topContentY } = this._mkModalBg(MX, MY, PW, PH, 'Trade at the Bank');
            backdrop.on('pointerdown', () => this._clearModal());

            const makeRow = (label, obj, yOff, isPrimary) => {
                this._mtrack(this.add.text(MX - PW/2 + 18, MY + yOff, label, {
                    fontFamily: '"Cinzel", Georgia, serif', fontSize: '10px', color: C.goldDimS,
                    letterSpacing: 2,
                }).setOrigin(0, 0.5).setDepth(50));
                RESOURCES.forEach((r, i) => {
                    const rx  = MX - 118 + i * 62;
                    const ry  = MY + yOff;
                    const sel = obj[r] > 0;
                    const colFill  = sel ? (isPrimary ? 0x3a0d0d : 0x0d2a1a) : C.void;
                    const colStroke = sel ? (isPrimary ? 0x8b1520 : 0x27ae60) : C.goldDim;
                    const box = this.add.rectangle(rx, ry, 58, 32, colFill, sel ? 1 : 0.8)
                        .setOrigin(0.5).setDepth(50)
                        .setStrokeStyle(1, colStroke, sel ? 0.9 : 0.35)
                        .setInteractive({ cursor: 'pointer' });
                    const t = this.add.text(rx, ry, r.slice(0,3).toUpperCase() + (sel ? `\n${obj[r]}` : ''), {
                        fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px',
                        color: sel ? (isPrimary ? '#c41e3a' : '#27ae60') : C.goldDimS,
                        align: 'center',
                    }).setOrigin(0.5).setDepth(51);
                    box.on('pointerover', () => box.setAlpha(0.8));
                    box.on('pointerout',  () => box.setAlpha(1));
                    box.on('pointerdown', () => { RESOURCES.forEach(k => obj[k] = 0); obj[r] = isPrimary ? (caravanActive ? 2 : 4) : 1; redraw(); });
                    this._mtrack(box, t);
                });
            };
            makeRow(`OFFER  (${caravanActive ? '2' : '4'})`, giving,    -46, true);
            makeRow('RECEIVE (1)', receiving,  34, false);

            const cancelBg = this.add.rectangle(MX - 80, MY + PH/2 - 30, 120, 30, C.void, 1)
                .setOrigin(0.5).setDepth(50)
                .setStrokeStyle(1, C.goldDim, 0.5)
                .setInteractive({ cursor: 'pointer' });
            const cancelT  = this.add.text(MX - 80, MY + PH/2 - 30, 'CANCEL', {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: C.goldDimS, letterSpacing: 3,
            }).setOrigin(0.5).setDepth(51);
            cancelBg.on('pointerdown', () => this._clearModal());

            const tradeBg = this.add.rectangle(MX + 80, MY + PH/2 - 30, 120, 30, C.void, 1)
                .setOrigin(0.5).setDepth(50)
                .setStrokeStyle(1, 0x27ae60, 0.7)
                .setInteractive({ cursor: 'pointer' });
            const tradeT  = this.add.text(MX + 80, MY + PH/2 - 30, 'CONFIRM', {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: '#27ae60', letterSpacing: 3,
            }).setOrigin(0.5).setDepth(51);
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

        const { backdrop } = this._mkModalBg(MX, MY, 380, 180, 'Harvest — Choose a Resource');
        backdrop.on('pointerdown', () => this._clearModal());

        RESOURCES.forEach((r, i) => {
            const rx  = MX - 148 + i * 74;
            const gfx = this.add.graphics().setDepth(50);
            gfx.fillStyle(C.void, 1);
            gfx.fillRect(rx - 29, MY + 10, 58, 36);
            gfx.lineStyle(1, C.goldDim, 0.6);
            gfx.strokeRect(rx - 29, MY + 10, 58, 36);
            const t = this.add.text(rx, MY + 28, r.slice(0,3).toUpperCase(), {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '10px', color: C.parchment, letterSpacing: 2,
            }).setOrigin(0.5).setDepth(51);
            gfx.setInteractive(new Phaser.Geom.Rectangle(rx - 29, MY + 10, 58, 36), Phaser.Geom.Rectangle.Contains);
            gfx.on('pointerover', () => gfx.clear().fillStyle(0x1a1628, 1).fillRect(rx-29,MY+10,58,36).lineStyle(1,C.gold,0.7).strokeRect(rx-29,MY+10,58,36));
            gfx.on('pointerout',  () => gfx.clear().fillStyle(C.void,1).fillRect(rx-29,MY+10,58,36).lineStyle(1,C.goldDim,0.6).strokeRect(rx-29,MY+10,58,36));
            gfx.on('pointerdown', () => {
                Network.sendAction({ type: 'play_card', card_id: cardId, resource: r });
                this._clearModal();
            });
            this._mtrack(gfx, t);
        });

        const cancelBg = this.add.rectangle(MX, MY + 66, 100, 28, C.void, 1)
            .setOrigin(0.5).setDepth(50).setStrokeStyle(1, C.goldDim, 0.4)
            .setInteractive({ cursor: 'pointer' });
        const cancelT  = this.add.text(MX, MY + 66, 'CANCEL', {
            fontFamily: '"Cinzel", Georgia, serif', fontSize: '8px', color: C.goldDimS, letterSpacing: 3,
        }).setOrigin(0.5).setDepth(51);
        cancelBg.on('pointerdown', () => this._clearModal());
        this._mtrack(cancelBg, cancelT);
    }

    // ── player pick modal ─────────────────────────────────────────

    _showPlayerPickModal(cardId, state) {
        this._clearModal();
        this._showingModal = 'player_pick';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const others = state.player_order.filter(p => p !== this.myPlayerId);
        const PH     = 100 + others.length * 52;

        const { backdrop } = this._mkModalBg(MX, MY, 300, PH, 'Choose a Lord');
        backdrop.on('pointerdown', () => this._clearModal());

        others.forEach((pid, i) => {
            const p   = state.players[pid];
            const by  = MY - PH/2 + 68 + i * 52;
            const col = PLAYER_HEX[p.color] ?? 0x555555;
            const colS= PLAYER_CSS[p.color] ?? '#ffffff';
            const bg  = this.add.rectangle(MX, by, 240, 36, C.void, 1)
                .setOrigin(0.5).setDepth(50)
                .setStrokeStyle(1, col, 0.65)
                .setInteractive({ cursor: 'pointer' });
            const t   = this.add.text(MX, by, p.name, {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '12px', color: colS, letterSpacing: 1,
            }).setOrigin(0.5).setDepth(51);
            bg.on('pointerover', () => bg.setFillStyle(0x1a1628));
            bg.on('pointerout',  () => bg.setFillStyle(C.void));
            bg.on('pointerdown', () => {
                Network.sendAction({ type: 'play_card', card_id: cardId, target_player: pid });
                this._clearModal();
            });
            this._mtrack(bg, t);
        });

        const cancelBg = this.add.rectangle(MX, MY + PH/2 - 24, 100, 28, C.void, 1)
            .setOrigin(0.5).setDepth(50).setStrokeStyle(1, C.goldDim, 0.4)
            .setInteractive({ cursor: 'pointer' });
        const cancelT  = this.add.text(MX, MY + PH/2 - 24, 'CANCEL', {
            fontFamily: '"Cinzel", Georgia, serif', fontSize: '8px', color: C.goldDimS, letterSpacing: 3,
        }).setOrigin(0.5).setDepth(51);
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
            const PW = 460, PH = 430;
            const { backdrop, topContentY } = this._mkModalBg(MX, MY, PW, PH, 'Propose a Trade');
            backdrop.on('pointerdown', () => this._clearModal());

            // Target player selector
            this._mtrack(this.add.text(MX - PW/2 + 18, topContentY + 10, 'TRADE WITH', {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '8px', color: C.goldDimS, letterSpacing: 4,
            }).setOrigin(0, 0.5).setDepth(50));
            others.forEach((pid, i) => {
                const p   = state.players[pid];
                const sel = pid === targetPlayer;
                const col = PLAYER_HEX[p.color] ?? 0x555555;
                const bx  = MX - PW/2 + 130 + i * 100;
                const bg  = this.add.rectangle(bx, topContentY + 10, 90, 24, sel ? 0x1a1628 : C.void, 1)
                    .setOrigin(0.5).setDepth(50)
                    .setStrokeStyle(1, col, sel ? 0.8 : 0.3)
                    .setInteractive({ cursor: 'pointer' });
                const t   = this.add.text(bx, topContentY + 10, p.name, {
                    fontFamily: '"Cinzel", Georgia, serif', fontSize: '11px',
                    color: sel ? (PLAYER_CSS[p.color] ?? '#ffffff') : C.goldDimS,
                }).setOrigin(0.5).setDepth(51);
                bg.on('pointerdown', () => { targetPlayer = pid; redraw(); });
                this._mtrack(bg, t);
            });

            const makeRow = (label, obj, yOff, mine) => {
                this._mtrack(this.add.text(MX - PW/2 + 18, MY + yOff, label, {
                    fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: C.goldDimS, letterSpacing: 3,
                }).setOrigin(0, 0.5).setDepth(50));
                RESOURCES.forEach((r, i) => {
                    const rx  = MX - PW/2 + 112 + i * 64;
                    const ry  = MY + yOff;
                    const cnt = obj[r];
                    const sel = cnt > 0;
                    const colFill   = sel ? (mine ? 0x3a0d0d : 0x0d2a1a) : C.void;
                    const colStroke = sel ? (mine ? 0x8b1520 : 0x27ae60) : C.goldDim;
                    const box = this.add.rectangle(rx, ry, 58, 30, colFill, sel ? 1 : 0.8)
                        .setOrigin(0.5).setDepth(50)
                        .setStrokeStyle(1, colStroke, sel ? 0.9 : 0.3)
                        .setInteractive({ cursor: 'pointer' });
                    const sub  = mine ? `\n(${me.resources[r]})` : '';
                    const txt  = this.add.text(rx, ry, r.slice(0,3).toUpperCase() + (cnt > 0 ? `\n×${cnt}` : sub), {
                        fontFamily: '"Cinzel", Georgia, serif', fontSize: '8px',
                        color: sel ? (mine ? '#c41e3a' : '#27ae60') : C.goldDimS,
                        align: 'center',
                    }).setOrigin(0.5).setDepth(51);
                    box.on('pointerdown', () => { obj[r] = mine ? Math.min(obj[r]+1, me.resources[r]) : Math.min(obj[r]+1, 9); redraw(); });
                    box.on('rightdown',   () => { obj[r] = Math.max(0, obj[r]-1); redraw(); });
                    this._mtrack(box, txt);
                });
            };
            makeRow('YOU OFFER:',    offering,   -90, true);
            makeRow('YOU SEEK:',     requesting, -22, false);
            this._mtrack(this.add.text(MX, MY + 42, 'left-click to add  ·  right-click to remove', {
                fontFamily: '"IM Fell English SC", Georgia, serif', fontSize: '9px', color: '#3a2e18',
            }).setOrigin(0.5).setDepth(50));

            const cancelBg = this.add.rectangle(MX - 80, MY + PH/2 - 30, 120, 30, C.void, 1)
                .setOrigin(0.5).setDepth(50).setStrokeStyle(1, C.goldDim, 0.5)
                .setInteractive({ cursor: 'pointer' });
            const cancelT  = this.add.text(MX - 80, MY + PH/2 - 30, 'CANCEL', {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: C.goldDimS, letterSpacing: 3,
            }).setOrigin(0.5).setDepth(51);
            cancelBg.on('pointerdown', () => this._clearModal());

            const sendBg = this.add.rectangle(MX + 80, MY + PH/2 - 30, 120, 30, C.void, 1)
                .setOrigin(0.5).setDepth(50).setStrokeStyle(1, 0x27ae60, 0.7)
                .setInteractive({ cursor: 'pointer' });
            const sendT  = this.add.text(MX + 80, MY + PH/2 - 30, 'PROPOSE', {
                fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: '#27ae60', letterSpacing: 3,
            }).setOrigin(0.5).setDepth(51);
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

    // ── Mobile HUD ────────────────────────────────────────────────

    _initMobileHUD() {
        const el = document.createElement('div');
        el.id = 'm-hud';
        el.innerHTML = `
            <div id="m-peek">
                <div class="m-handle" id="m-handle">
                    <span class="m-handle-orn">◆ &nbsp; REALM &nbsp; ◆</span>
                </div>
                <div class="m-peek-row" id="m-peek-row">
                    <div class="m-res-strip">
                        <div class="mr" id="mr-timber"><span>TIM</span><b>0</b></div>
                        <div class="mr" id="mr-stone"><span>STN</span><b>0</b></div>
                        <div class="mr" id="mr-grain"><span>GRN</span><b>0</b></div>
                        <div class="mr" id="mr-wool"><span>WOL</span><b>0</b></div>
                        <div class="mr" id="mr-ore"><span>ORE</span><b>0</b></div>
                    </div>
                    <div class="m-peek-status">
                        <div class="m-peek-phase" id="m-peek-phase">—</div>
                        <div class="m-peek-vp"    id="m-peek-vp">0 ✦</div>
                        <div class="m-peek-arrow" id="m-peek-arrow">▲</div>
                    </div>
                </div>
            </div>
            <div id="m-drawer">
                <div class="m-tabs">
                    <button class="m-tab-btn active" data-tab="decree">DECREE</button>
                    <button class="m-tab-btn"        data-tab="coffers">COFFERS</button>
                    <button class="m-tab-btn"        data-tab="hand">HAND</button>
                </div>
                <div id="m-tab-body"></div>
            </div>
        `;
        document.body.appendChild(el);
        this._mHud = el;

        const toggle = () => {
            el.classList.toggle('open');
            const ls   = el.classList.contains('landscape');
            const open = el.classList.contains('open');
            el.querySelector('#m-peek-arrow').textContent =
                ls ? (open ? '▷' : '◁') : (open ? '▼' : '▲');
        };
        el.querySelector('#m-handle').addEventListener('click', toggle);
        el.querySelector('#m-peek-row').addEventListener('click', toggle);

        el.querySelectorAll('.m-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                el.querySelectorAll('.m-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._mTab = btn.dataset.tab;
                if (this.gameState) this._renderMobileTab(this._mTab, this.gameState);
            });
        });

        el.classList.add('visible');
    }

    _removeMobileHUD() {
        if (this._mHud) { this._mHud.remove(); this._mHud = null; }
    }

    _onOrientationChange() {
        if (!this._mHud) return;
        const isLandscape = window.innerWidth > window.innerHeight;
        if (this._mHud.classList.contains('landscape') === isLandscape) return;
        this._mHud.classList.remove('open');
        this._mHud.classList.toggle('landscape', isLandscape);
        const arrow = this._mHud.querySelector('#m-peek-arrow');
        if (arrow) arrow.textContent = isLandscape ? '◁' : '▲';
    }

    _updateMobileHUD(state) {
        if (!this._mHud) return;
        const me       = state.players[this.myPlayerId];
        const isMyTurn = state.turn.current_player === this.myPlayerId;
        const phase    = state.turn.phase;

        // Resource badges in peek strip
        ['timber', 'stone', 'grain', 'wool', 'ore'].forEach(r => {
            const el = this._mHud.querySelector(`#mr-${r}`);
            if (!el) return;
            const n = me?.resources[r] ?? 0;
            el.querySelector('b').textContent = n;
            el.classList.toggle('has', n > 0);
        });

        // Phase / VP / turn glow
        const phaseEl = this._mHud.querySelector('#m-peek-phase');
        const vpEl    = this._mHud.querySelector('#m-peek-vp');
        const peekEl  = this._mHud.querySelector('#m-peek');
        const vp      = (me?.victory_points ?? 0) + (me?.vp_cards ?? 0)
            + (state.longest_road_owner === this.myPlayerId ? 2 : 0)
            + (state.largest_army_owner === this.myPlayerId ? 2 : 0);

        if (isMyTurn) {
            phaseEl.textContent = PHASE_LABEL[phase] ?? phase;
            phaseEl.className   = 'm-peek-phase my-turn';
            vpEl.className      = 'm-peek-vp my-turn';
            peekEl.classList.add('my-turn');
        } else {
            const cp = state.players[state.turn.current_player];
            phaseEl.textContent = cp?.name ?? '—';
            phaseEl.className   = 'm-peek-phase';
            vpEl.className      = 'm-peek-vp';
            peekEl.classList.remove('my-turn');
        }
        vpEl.textContent = `${vp} ✦`;

        // Hand count badge on tab
        const handTab = this._mHud.querySelector('[data-tab="hand"]');
        if (handTab) handTab.textContent = `HAND (${me?.hand?.length ?? 0})`;

        // Re-render active tab content
        this._renderMobileTab(this._mTab, state);

        // Auto-close drawer when board interaction is needed
        const bMode      = this.registry.get('buildMode');
        const needsBoard = bMode || phase === 'setup_s1' || phase === 'setup_s2'
                        || phase === 'setup_road' || phase === 'robber';
        if (needsBoard && isMyTurn && this._mHud.classList.contains('open')) {
            this._mHud.classList.remove('open');
            const ls = this._mHud.classList.contains('landscape');
            this._mHud.querySelector('#m-peek-arrow').textContent = ls ? '◁' : '▲';
        }
    }

    _renderMobileTab(tab, state) {
        const body = this._mHud?.querySelector('#m-tab-body');
        if (!body) return;
        const me       = state.players[this.myPlayerId];
        const isMyTurn = state.turn.current_player === this.myPlayerId;
        const phase    = state.turn.phase;
        const bMode    = this.registry.get('buildMode');

        if (tab === 'decree') {
            body.innerHTML = this._mDecreeHTML(phase, isMyTurn, bMode);
            this._attachDecreeHandlers(body, phase, state, bMode);
        } else if (tab === 'coffers') {
            body.innerHTML = this._mCoffersHTML(me, state);
        } else {
            body.innerHTML = this._mHandHTML(me, state, isMyTurn, phase);
            this._attachHandHandlers(body, me, state, isMyTurn, phase);
        }
    }

    _mDecreeHTML(phase, isMyTurn, bMode) {
        if (!isMyTurn) {
            return `<div class="m-tc"><div class="m-awaiting">Awaiting your fellow lords…</div></div>`;
        }
        const label = PHASE_LABEL[phase] ?? phase;
        const lblCls = phase === 'robber' ? 'danger' : (phase === 'draw' || phase === 'roll') ? 'glow' : '';
        let h = `<div class="m-tc"><div class="m-phase-lbl ${lblCls}">${label}</div>`;

        if (phase === 'draw') {
            h += `<button class="m-btn-decree" id="m-draw">✦  DRAW A DECREE</button>`;
        } else if (phase === 'roll') {
            h += `<button class="m-btn-decree roll" id="m-roll">⚄  CAST THE DICE</button>`;
        } else if (phase === 'action') {
            const active = (k) => bMode === k ? 'active' : '';
            h += `
                <div class="m-build-grid">
                    <button class="m-btn-build ${active('road')}"       id="mb-road">ROAD<small>1 TIM · 1 STN</small></button>
                    <button class="m-btn-build ${active('settlement')}" id="mb-settle">SETTLEMENT<small>1 of each</small></button>
                    <button class="m-btn-build ${active('city')}"       id="mb-city">CITY<small>3 ORE · 2 GRN</small></button>
                    <button class="m-btn-build"                         id="mb-buy">BUY DECREE<small>1 ORE · 1 GRN · 1 WOL</small></button>
                </div>
                <div class="m-trade-row">
                    <button class="m-btn-trade bank" id="mb-bank">BANK TRADE</button>
                    <button class="m-btn-trade p2p"  id="mb-p2p">P2P TRADE</button>
                </div>
                <button class="m-btn-decree end" id="mb-end">END TURN</button>`;
        } else if (phase === 'setup_s1' || phase === 'setup_s2') {
            h += `<div class="m-awaiting">Tap a vertex on the board<br>to place your settlement.</div>`;
        } else if (phase === 'setup_road') {
            h += `<div class="m-awaiting">Tap an edge on the board<br>to lay your first road.</div>`;
        } else if (phase === 'robber') {
            h += `<div class="m-awaiting robber">Tap a hex to unleash the Robber.</div>`;
        }

        h += '</div>';
        return h;
    }

    _attachDecreeHandlers(body, phase, state, bMode) {
        body.querySelector('#m-draw')?.addEventListener('click',   () => Network.sendAction({ type: 'draw_card' }));
        body.querySelector('#m-roll')?.addEventListener('click',   () => Network.sendAction({ type: 'roll_dice' }));
        body.querySelector('#mb-road')?.addEventListener('click',  () => this._toggleBuild('road'));
        body.querySelector('#mb-settle')?.addEventListener('click',() => this._toggleBuild('settlement'));
        body.querySelector('#mb-city')?.addEventListener('click',  () => this._toggleBuild('city'));
        body.querySelector('#mb-buy')?.addEventListener('click',   () => Network.sendAction({ type: 'buy_extra_card' }));
        body.querySelector('#mb-bank')?.addEventListener('click',  () => this._showTradeModal(state));
        body.querySelector('#mb-p2p')?.addEventListener('click',   () => this._showP2PTradeModal(state));
        body.querySelector('#mb-end')?.addEventListener('click',   () => {
            Network.sendAction({ type: 'end_turn' });
            this.registry.set('buildMode', null);
        });
    }

    _mCoffersHTML(me, state) {
        const RES = [
            { key: 'timber', abbr: 'TIM', bg: '#090f09' },
            { key: 'stone',  abbr: 'STN', bg: '#0c0c0c' },
            { key: 'grain',  abbr: 'GRN', bg: '#100d00' },
            { key: 'wool',   abbr: 'WOL', bg: '#060f0a' },
            { key: 'ore',    abbr: 'ORE', bg: '#060612' },
        ];
        const coffers = RES.map(r => {
            const n = me?.resources[r.key] ?? 0;
            return `<div class="m-coffer ${n > 0 ? 'has' : ''}" style="background:${r.bg}">
                        <span>${r.abbr}</span><b>${n}</b>
                    </div>`;
        }).join('');

        const rows = state.player_order.map(pid => {
            const p  = state.players[pid];
            const vp = p.victory_points + p.vp_cards
                + (state.longest_road_owner === pid ? 2 : 0)
                + (state.largest_army_owner === pid ? 2 : 0);
            const col = PLAYER_CSS[p.color] ?? '#e8dcc8';
            const cls = pid === this.myPlayerId ? 'me' : '';
            return `<div class="m-score-row ${cls}">
                        <span class="m-score-name" style="color:${col}">${p.name}</span>
                        <span class="m-score-vp">${vp} ✦</span>
                    </div>`;
        }).join('');

        return `<div class="m-tc">
            <div class="m-coffer-row">${coffers}</div>
            <div class="m-scoreboard">${rows}</div>
        </div>`;
    }

    _mHandHTML(me, state, isMyTurn, phase) {
        const hand = me?.hand ?? [];
        if (!hand.length) {
            return `<div class="m-tc"><div class="m-empty">No decrees in hand.</div></div>`;
        }
        const BG  = { action: '#0d1828', structure: '#180d28', vp: '#1e1600', event: '#220d0d' };
        const ACC = CARD_ACCENT_S;
        const cards = hand.map(card => {
            const canPlay = isMyTurn && phase === 'action' && card.type !== 'vp';
            const bg      = BG[card.type]  ?? '#0d0c1a';
            const acc     = ACC[card.type] ?? '#3a3a6a';
            return `<div class="m-card ${canPlay ? 'can-play' : ''}"
                         data-id="${card.id}" data-type="${card.type}"
                         style="background:${bg}">
                        <div class="m-card-inset" style="border-color:${acc}"></div>
                        <div class="m-card-orn"   style="color:${acc}">✦</div>
                        <div class="m-card-name">${card.name}</div>
                        <div class="m-card-type" style="color:${acc}">${card.type.slice(0,3).toUpperCase()}</div>
                    </div>`;
        }).join('');
        return `<div class="m-tc"><div class="m-hand-scroll">${cards}</div></div>`;
    }

    _attachHandHandlers(body, me, state, isMyTurn, phase) {
        body.querySelectorAll('.m-card').forEach(el => {
            const cardId = el.dataset.id;
            const card   = me?.hand?.find(c => c.id === cardId);
            if (!card) return;
            const canPlay = isMyTurn && phase === 'action' && card.type !== 'vp';
            let pressTimer = null;
            el.addEventListener('pointerdown', () => {
                pressTimer = setTimeout(() => { pressTimer = null; this._showCardPopup(card); }, 500);
            });
            el.addEventListener('pointerup', () => {
                if (pressTimer) {
                    clearTimeout(pressTimer); pressTimer = null;
                    if (canPlay) this._playCard(card, state);
                }
            });
            el.addEventListener('pointercancel', () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            });
        });
    }

    // ── trade response modal ──────────────────────────────────────

    _showTradeResponseModal(trade, state) {
        this._clearModal();
        this._showingModal = 'trade_response';
        const { width, height } = this.scale;
        const MX = width / 2, MY = height / 2;
        const proposer = state.players[trade.from_player];
        const PW = 380, PH = 290;
        const fmt = (obj) => Object.entries(obj).filter(([,v])=>v>0).map(([r,v])=>`${v} ${r}`).join(', ') || 'nothing';

        const { backdrop } = this._mkModalBg(MX, MY, PW, PH, `Trade from ${proposer?.name ?? '?'}`);
        backdrop.on('pointerdown', () => {});

        const offerT = this.add.text(MX, MY - 54, `They offer:   ${fmt(trade.offering)}`, {
            fontFamily: '"IM Fell English", Georgia, serif', fontStyle: 'italic',
            fontSize: '13px', color: '#5acf7a', wordWrap: { width: PW - 40 }, align: 'center',
        }).setOrigin(0.5).setDepth(50);
        const wantT  = this.add.text(MX, MY - 10, `They seek:   ${fmt(trade.requesting)}`, {
            fontFamily: '"IM Fell English", Georgia, serif', fontStyle: 'italic',
            fontSize: '13px', color: '#c45a5a', wordWrap: { width: PW - 40 }, align: 'center',
        }).setOrigin(0.5).setDepth(50);
        this._mtrack(offerT, wantT);

        const rejectBg = this.add.rectangle(MX - 80, MY + PH/2 - 30, 120, 30, C.void, 1)
            .setOrigin(0.5).setDepth(50).setStrokeStyle(1, 0x8b1520, 0.7)
            .setInteractive({ cursor: 'pointer' });
        const rejectT  = this.add.text(MX - 80, MY + PH/2 - 30, 'REJECT', {
            fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: '#c41e3a', letterSpacing: 3,
        }).setOrigin(0.5).setDepth(51);
        rejectBg.on('pointerdown', () => { Network.sendAction({ type: 'respond_trade', accept: false }); this._clearModal(); });

        const acceptBg = this.add.rectangle(MX + 80, MY + PH/2 - 30, 120, 30, C.void, 1)
            .setOrigin(0.5).setDepth(50).setStrokeStyle(1, 0x27ae60, 0.7)
            .setInteractive({ cursor: 'pointer' });
        const acceptT  = this.add.text(MX + 80, MY + PH/2 - 30, 'ACCEPT', {
            fontFamily: '"Cinzel", Georgia, serif', fontSize: '9px', color: '#27ae60', letterSpacing: 3,
        }).setOrigin(0.5).setDepth(51);
        acceptBg.on('pointerdown', () => { Network.sendAction({ type: 'respond_trade', accept: true }); this._clearModal(); });

        this._mtrack(rejectBg, rejectT, acceptBg, acceptT);
    }
}
