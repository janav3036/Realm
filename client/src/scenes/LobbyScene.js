import Phaser from 'phaser';
import Network from '../network.js';

const PLAYER_CSS = {
    red:    '#c41e3a',
    blue:   '#3a7bd5',
    green:  '#27ae60',
    orange: '#e67e22',
};

export default class LobbyScene extends Phaser.Scene {
    constructor() { super({ key: 'LobbyScene' }); }

    init() {
        this.myPlayerId    = null;
        this.myName        = '';
        this.roomCode      = null;
        this.isHost        = false;
        this.hostId        = null;
        this.lobbyPlayers  = {};
        this._uiItems      = [];
        this._overlay      = null;
        this._boundHandlers = {};
        this._reconnecting = false;
    }

    create() {
        if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');
        this._setupListeners();

        // If URL has ?room=XXXX, pre-fill the join form so reloads rejoin the room
        const saved = localStorage.getItem('realm_session');
        if (saved) {
            try {
                const { roomCode, playerId } = JSON.parse(saved);
                if (roomCode && playerId) {
                    this._reconnecting = true;
                    Network.reconnect(roomCode, playerId);
                    return;
                }
            } catch (e) {}
        }
        const roomParam = new URLSearchParams(window.location.search).get('room')?.toUpperCase().trim();
        this._showHome(roomParam?.length === 4 ? roomParam : null);
    }

    shutdown() {
        this._clearUI();
        this._removeOverlay();
        Object.entries(this._boundHandlers).forEach(([ev, cb]) => Network.off(ev, cb));
    }

    _clearUI()     { this._uiItems.forEach(o => o.destroy()); this._uiItems = []; }
    _track(...items) { this._uiItems.push(...items); }
    _removeOverlay() { if (this._overlay) { this._overlay.remove(); this._overlay = null; } }

    _setupListeners() {
        this._boundHandlers = {
            room_created:  this._onRoomCreated.bind(this),
            joined_room:   this._onJoinedRoom.bind(this),
            state_update:  this._onStateUpdate.bind(this),
            error:         this._onError.bind(this),
            reconnected:   this._onReconnected.bind(this),
        };
        Object.entries(this._boundHandlers).forEach(([ev, cb]) => Network.on(ev, cb));
    }

    // ── views ─────────────────────────────────────────────────────

    _showHome(prefillRoom = null) {
        this._clearUI();
        this._removeOverlay();

        // Clear the room param from the URL — we're on the home screen
        history.replaceState(null, '', location.pathname);

        const { width, height } = this.scale;
        const cx = width / 2, cy = height / 2;

        const gfx = this.add.graphics();
        gfx.lineStyle(1, 0xc9a227, 0.04);
        gfx.lineBetween(0, cy, width, cy);
        gfx.lineBetween(cx, 0, cx, height);
        this._track(gfx);

        [
            [60, 60], [width - 60, 60],
            [60, height - 60], [width - 60, height - 60],
        ].forEach(([x, y]) => {
            const g = this.add.text(x, y, '✦', {
                fontFamily: 'serif', fontSize: '12px', color: '#c9a227',
            }).setOrigin(0.5).setAlpha(0.08);
            this._track(g);
        });

        const isRejoin    = !!prefillRoom;
        const codeDisplay = isRejoin ? 'block' : 'none';
        const subtitle    = isRejoin
            ? 'Returning to your realm'
            : 'A Kingdom Awaits';

        const overlay = document.createElement('div');
        overlay.id = 'lobby-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none;';

        overlay.innerHTML = `
            <div class="r-panel" style="pointer-events:all;width:320px;padding:38px 38px 30px;text-align:center;">
                <div style="font-family:'Cinzel Decorative',serif;font-size:40px;color:#c9a227;letter-spacing:6px;line-height:1;text-shadow:0 0 32px rgba(201,162,39,0.4);">REALM</div>
                <div style="font-family:'IM Fell English SC',serif;font-size:11px;color:#5a4010;letter-spacing:3px;margin:8px 0 22px;">${subtitle}</div>
                <div class="r-divider"></div>

                <span class="r-lbl">Your Name</span>
                <input id="nameInput" class="r-input" type="text" placeholder="Enter Name" maxlength="16" autocomplete="off" spellcheck="false">

                <div id="codeRow" style="display:${codeDisplay};margin-top:4px;">
                    <span class="r-lbl" style="margin-top:10px;">Room Sigil</span>
                    <input id="codeInput" class="r-input r-input-code" type="text" placeholder="ABCD" maxlength="4" value="${prefillRoom ?? ''}" autocomplete="off" spellcheck="false">
                </div>

                <div style="margin-top:20px;">
                    ${!isRejoin ? '<button id="createBtn" class="r-btn r-btn-primary">✦ Create Room</button>' : ''}
                    <button id="joinBtn" class="r-btn ${isRejoin ? 'r-btn-primary' : ''}">${isRejoin ? '⚔ Rejoin Realm' : '⚔ Join Room'}</button>
                </div>

                <p id="errMsg" class="r-error"></p>
            </div>
        `;

        document.body.appendChild(overlay);
        this._overlay = overlay;

        // Auto-focus name field
        setTimeout(() => document.getElementById('nameInput')?.focus(), 80);

        let joinMode = isRejoin;

        document.getElementById('createBtn')?.addEventListener('click', () => {
            const name = document.getElementById('nameInput').value.trim();
            if (!name) { document.getElementById('errMsg').textContent = 'A name is required, wanderer.'; return; }
            this.myName = name;
            Network.createRoom(name);
        });

        document.getElementById('joinBtn').addEventListener('click', () => {
            if (!joinMode) {
                joinMode = true;
                document.getElementById('codeRow').style.display = 'block';
                document.getElementById('joinBtn').textContent = '⚔ Enter the Realm';
                return;
            }
            const name = document.getElementById('nameInput').value.trim();
            const code = document.getElementById('codeInput').value.trim().toUpperCase();
            if (!name) { document.getElementById('errMsg').textContent = 'A name is required, wanderer.'; return; }
            if (code.length !== 4) { document.getElementById('errMsg').textContent = 'The sigil must be 4 letters.'; return; }
            this.myName = name;
            Network.joinRoom(code, name);
        });

        document.getElementById('nameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('joinBtn').click();
        });
        document.getElementById('codeInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('joinBtn').click();
        });
    }

    _showWaiting() {
        this._clearUI();
        this._removeOverlay();

        // Stamp room code into URL so a reload brings up the rejoin form
        history.replaceState(null, '', `?room=${this.roomCode}`);

        const playerRows = Object.entries(this.lobbyPlayers).map(([pid, info]) => {
            const isHost = pid === this.hostId;
            const isYou  = pid === this.myPlayerId;
            const col    = PLAYER_CSS[info.color] ?? '#e8dcc8';
            const dot    = `<span style="width:9px;height:9px;border-radius:50%;display:inline-block;background:${col};margin-right:10px;flex-shrink:0;"></span>`;
            const crown  = isHost
                ? `<span class="r-player-crown">♔</span>`
                : `<span style="display:inline-block;width:18px;"></span>`;
            const youTag = isYou ? `<span class="r-player-tag">You</span>` : '';
            return `<div class="r-player">${dot}${crown}<span class="r-player-name" style="color:${col};">${info.name}</span>${youTag}</div>`;
        }).join('');

        const actionSection = this.isHost
            ? `<div style="margin-top:20px;pointer-events:all;">
                   <button id="startBtn" class="r-btn r-btn-full">Begin the Campaign</button>
                   <div style="font-size:8px;letter-spacing:3px;color:#5a4010;text-align:center;margin-top:7px;">REQUIRES 2–4 PLAYERS</div>
               </div>`
            : `<div style="font-family:'IM Fell English SC',serif;font-size:12px;color:#7a7060;text-align:center;margin-top:18px;letter-spacing:1px;">The host prepares the realm…</div>`;

        const overlay = document.createElement('div');
        overlay.id = 'lobby-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none;';

        overlay.innerHTML = `
            <div class="r-panel" style="pointer-events:all;width:340px;padding:32px 36px 28px;text-align:center;">
                <span class="r-lbl">Room Sigil</span>
                <div class="r-code">${this.roomCode}</div>
                <div class="r-divider"></div>
                <span class="r-lbl" style="margin-bottom:10px;">Assembled Lords</span>
                <div id="playerList">${playerRows}</div>
                ${actionSection}
                <p id="errMsg" class="r-error"></p>
            </div>
        `;

        document.body.appendChild(overlay);
        this._overlay = overlay;

        if (this.isHost) {
            document.getElementById('startBtn').addEventListener('click', () => {
                Network.startGame();
            });
        }
    }

    _renderPlayerList() {
        const el = document.getElementById('playerList');
        if (!el) return;
        el.innerHTML = Object.entries(this.lobbyPlayers).map(([pid, info]) => {
            const isHost = pid === this.hostId;
            const isYou  = pid === this.myPlayerId;
            const col    = PLAYER_CSS[info.color] ?? '#e8dcc8';
            const dot    = `<span style="width:9px;height:9px;border-radius:50%;display:inline-block;background:${col};margin-right:10px;flex-shrink:0;"></span>`;
            const crown  = isHost ? `<span class="r-player-crown">♔</span>` : `<span style="display:inline-block;width:18px;"></span>`;
            const youTag = isYou ? `<span class="r-player-tag">You</span>` : '';
            return `<div class="r-player">${dot}${crown}<span class="r-player-name" style="color:${col};">${info.name}</span>${youTag}</div>`;
        }).join('');
    }

    // ── network handlers ──────────────────────────────────────────

    _onRoomCreated(data) {
        Network.roomCode  = data.room_code;
        Network.playerId  = data.player_id;
        this.myPlayerId   = data.player_id;
        Network.saveSession(data.room_code, data.player_id);
        this.roomCode     = data.room_code;
        this.isHost       = true;
        this.hostId       = data.player_id;
        this.lobbyPlayers = { [data.player_id]: { name: this.myName } };
        this._showWaiting();
    }

    _onJoinedRoom(data) {
        Network.roomCode = data.room_code;
        Network.playerId = data.player_id;
        this.myPlayerId  = data.player_id;
        this.roomCode    = data.room_code;
        Network.saveSession(data.room_code, data.player_id);
        history.replaceState(null, '', `?room=${data.room_code}`);
    }

    _onStateUpdate(state) {
        if (state.status === 'lobby') {
            this.hostId       = state.host;
            this.isHost       = state.host === this.myPlayerId;
            this.lobbyPlayers = state.players;
            this._showWaiting();
            return;
        }
        if (state.board) {
            if (state.game_over || state.winner) return;
            this._removeOverlay();
            this.registry.set('myPlayerId', this.myPlayerId);
            this.registry.set('isHost', this.isHost);
            this.scene.start('GameScene', { initialState: state });
        }
    }

    _onError(data) {
        const el = document.getElementById('errMsg');
        if (el) el.textContent = data.message;
        if (data.code === 'NOT_FOUND' && this._reconnecting) {
            this._reconnecting = false;
            Network.clearSession();
            const roomParam = new URLSearchParams(window.location.search).get('room')?.toUpperCase().trim();
            this._showHome(roomParam?.length === 4 ? roomParam : null);
        }
        if (!el) console.warn('Server error:', data.message);
    }

    _onReconnected(data) {
        Network.roomCode  = data.room_code;
        Network.playerId  = data.player_id;
        this.myPlayerId   = data.player_id;
        this.isHost       = data.is_host;
        this._removeOverlay();
        this.registry.set('myPlayerId', data.player_id);
        this.registry.set('isHost', data.is_host);
        this.scene.start('GameScene', { initialState: data.state });
    }
}
