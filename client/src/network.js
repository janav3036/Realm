import { io } from 'socket.io-client';

const SERVER_URL = (typeof window !== 'undefined' && window.location.port !== '5173')
    ? window.location.origin
    : 'http://localhost:5050';

class Network {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.playerId = null;

    }
    connect() {
        if (this.socket) return;
        this.socket = io(SERVER_URL);

    }
    createRoom(playerName) {
        this.socket.emit('create_room', { player_name: playerName });

    }

    joinRoom(roomCode, playerName) {
        this.socket.emit('join_room', {
            room_code: roomCode.toUpperCase().trim(),
            player_name: playerName
        });
    }

    startGame() {
        this.socket.emit('start_game', {
            room_code: this.roomCode,
            player_id: this.playerId,
        });
    }

    sendAction(action) {
        this.socket.emit('action', {
            room_code: this.roomCode,
            player_id: this.playerId,
            action,
        });

    }

    endGame() {
        this.clearSession();
        this.socket.emit('end_game', { room_code: this.roomCode, player_id: this.playerId });
    }
    quitGame() {
        this.clearSession();
        this.socket.emit('quit_game', { room_code: this.roomCode, player_id: this.playerId });
    }
    saveSession(roomCode, playerId) {
        localStorage.setItem('realm_session', JSON.stringify({ roomCode, playerId }));
    }

    clearSession() {
        localStorage.removeItem('realm_session');
    }

    reconnect(roomCode, playerId) {
        this.roomCode = roomCode;
        this.playerId = playerId;
        this.socket.emit('reconnect_player', { room_code: roomCode, player_id: playerId });
    }


    on(event, cb) { this.socket.on(event, cb); }
    off(event, cb) { this.socket.off(event, cb); }
}

export default new Network();