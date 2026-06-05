import Phaser from 'phaser';
import Network from '../network.js';

export default class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
    }

    init() {
        this.myPlayerId = null;
        this.myName = '';
        this.roomCode = null;
        this.isHost = false;
        this.hostId = null;
        this.lobbyPlayers = {};
        this._uiItems = [];
        this._overlay = null;
        this._boundHandlers = {};
        this._playerListTexts = [];
        this._playerListY = 305;
    }

    create() {
        if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');
        this._setupListeners();
        this._showHome();
    }

    shutdown() {
        this._clearUI();
        this._removeOverlay();
        Object.entries(this._boundHandlers).forEach(([ev, cb]) => Network.off(ev, cb));
    }

    // ── helpers ───────────────────────────────────────────────────

    _clearUI() {
        this._uiItems.forEach(o => o.destroy());
        this._uiItems = [];
    }

    _track(...items) { this._uiItems.push(...items); }

    _removeOverlay() {
        if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    }

    _setupListeners() {
        this._boundHandlers = {
            room_created: this._onRoomCreated.bind(this),
            joined_room: this._onJoinedRoom.bind(this),
            state_update: this._onStateUpdate.bind(this),
            error: this._onError.bind(this),
        };
        Object.entries(this._boundHandlers).forEach(([ev, cb]) => Network.on(ev, cb));
    }

    // ── views ─────────────────────────────────────────────────────

    _showHome() {
        this._clearUI();
        this._removeOverlay();
        const { width, height } = this.scale;

        this._track(
            this.add.text(width / 2, height / 2 - 160, 'REALM', {
                fontSize: '72px', color: '#e8d5a3', fontStyle: 'bold',
            }).setOrigin(0.5),
            this.add.text(width / 2, height / 2 - 80, 'A multiplayer strategy game', {
                fontSize: '18px', color: '#666688',
            }).setOrigin(0.5)
        );

        const overlay = document.createElement('div');
        overlay.id = 'lobby-overlay';
        overlay.innerHTML = `
            <div id="lobby-form" style="
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,0px);
                text-align:center;font-family:sans-serif;">
                <input id="nameInput" type="text" placeholder="Your name" maxlength="16"
                    style="display:block;margin:8px auto;padding:10px;font-size:18px;
                           width:220px;background:#2a2a4a;color:#fff;
                           border:1px solid #5a5a8a;border-radius:6px;
                           text-align:center;outline:none;box-sizing:border-box;">
                <div id="codeRow" style="display:none;">
                    <input id="codeInput" type="text" placeholder="ROOM" maxlength="4"
                        style="display:block;margin:8px auto;padding:10px;font-size:20px;
                               width:160px;background:#2a2a4a;color:#e8d5a3;
                               border:1px solid #5a5a8a;border-radius:6px;
                               text-align:center;letter-spacing:8px;outline:none;
                               text-transform:uppercase;box-sizing:border-box;">
                </div>
                <div style="margin-top:12px;">
                    <button id="createBtn" style="margin:6px;padding:12px 28px;font-size:16px;
                        background:#3a7bd5;color:#fff;border:none;border-radius:6px;
                        cursor:pointer;font-weight:bold;">Create Room</button>
                    <button id="joinBtn" style="margin:6px;padding:12px 28px;font-size:16px;
                        background:#2d8f5f;color:#fff;border:none;border-radius:6px;
                        cursor:pointer;font-weight:bold;">Join Room</button>
                </div>
                <p id="errMsg" style="color:#e74c3c;font-size:14px;margin-top:8px;min-height:18px;"></p>
            </div>
        `;
        document.body.appendChild(overlay);
        this._overlay = overlay;

        let joinMode = false;

        document.getElementById('createBtn').addEventListener('click', () => {
            const name = document.getElementById('nameInput').value.trim();
            if (!name) { document.getElementById('errMsg').textContent = 'Enter your name first.'; return; }
            this.myName = name;
            Network.createRoom(name);
        });

        document.getElementById('joinBtn').addEventListener('click', () => {
            if (!joinMode) {
                joinMode = true;
                document.getElementById('codeRow').style.display = 'block';
                document.getElementById('joinBtn').textContent = 'Confirm Join';
                return;
            }
            const name = document.getElementById('nameInput').value.trim();
            const code = document.getElementById('codeInput').value.trim();
            if (!name) { document.getElementById('errMsg').textContent = 'Enter your name first.'; return; }
            if (code.length !== 4) { document.getElementById('errMsg').textContent = 'Room code must be 4 letters.'; return; }
            this.myName = name;
            Network.joinRoom(code, name);
        });
    }

    _showWaiting() {
        this._clearUI();
        this._removeOverlay();
        const { width, height } = this.scale;

        this._track(
            this.add.text(width / 2, 80, 'REALM', {
                fontSize: '48px', color: '#e8d5a3', fontStyle: 'bold',
            }).setOrigin(0.5),
            this.add.text(width / 2, 155, 'Room Code', {
                fontSize: '16px', color: '#666688',
            }).setOrigin(0.5),
            this.add.text(width / 2, 200, this.roomCode, {
                fontSize: '52px', color: '#ffffff', fontStyle: 'bold',
            }).setOrigin(0.5),
            this.add.text(width / 2, 270, 'Players', {
                fontSize: '20px', color: '#666688',
            }).setOrigin(0.5)
        );

        this._playerListY = 305;
        this._playerListTexts = [];
        this._renderPlayerList();

        const overlay = document.createElement('div');
        overlay.id = 'lobby-overlay';
        overlay.style.cssText = `
            position:absolute;bottom:80px;left:50%;
            transform:translateX(-50%);
            text-align:center;font-family:sans-serif;
        `;
        overlay.innerHTML = this.isHost
            ? `<button id="startBtn" style="padding:14px 44px;font-size:18px;
                   background:#d5a83a;color:#1a1a2e;border:none;border-radius:8px;
                   cursor:pointer;font-weight:bold;">Start Game</button>
               <p style="color:#666688;font-size:13px;margin-top:8px;">Need at least 2 players</p>`
            : `<p style="color:#666688;font-size:16px;">Waiting for host to start…</p>`;

        document.body.appendChild(overlay);
        this._overlay = overlay;

        if (this.isHost) {
            document.getElementById('startBtn').addEventListener('click', () => {
                Network.startGame();
            });
        }
    }

    _renderPlayerList() {
        this._playerListTexts.forEach(t => t.destroy());
        this._playerListTexts = [];

        const COLORS = {
            red: '#e74c3c', blue: '#3498db', green: '#2ecc71',
            orange: '#e67e22', yellow: '#f1c40f'
        };
        const { width } = this.scale;

        Object.entries(this.lobbyPlayers).forEach(([pid, info], i) => {
            const you = pid === this.myPlayerId ? ' (You)' : '';
            const host = pid === this.hostId ? ' ♔' : '';
            const col = COLORS[info.color] || '#ffffff';
            const t = this.add.text(
                width / 2,
                this._playerListY + i * 36,
                `${info.name}${you}${host}`,
                { fontSize: '20px', color: col }
            ).setOrigin(0.5);
            this._playerListTexts.push(t);
            this._track(t);
        });
    }

    // ── network handlers ──────────────────────────────────────────

    _onRoomCreated(data) {
        Network.roomCode = data.room_code;
        Network.playerId = data.player_id;
        this.myPlayerId = data.player_id;
        this.roomCode = data.room_code;
        this.isHost = true;
        this.hostId = data.player_id;
        this.lobbyPlayers = { [data.player_id]: { name: this.myName } };
        this._showWaiting();
    }

    _onJoinedRoom(data) {
        Network.roomCode = data.room_code;
        Network.playerId = data.player_id;
        this.myPlayerId = data.player_id;
        this.roomCode = data.room_code;
    }

    _onStateUpdate(state) {
        if (state.status === 'lobby') {
            this.hostId = state.host;
            this.isHost = state.host === this.myPlayerId;
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
        else console.warn('Server error:', data.message);
    }
}
