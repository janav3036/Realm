import Phaser from 'phaser';
import HexBoard from './objects/HexBoard.js';

class GameScene extends Phaser.Scene {
    constructor() {
        super({key: 'GameScene'});
    }

    async create() {
        const response = await fetch('http://localhost:5050/board');
        const board = await response.json();

        this.hexBoard = new HexBoard(this);
        this.hexBoard.render(board);
    }
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#1a1a2e',
    scene: [GameScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    }
};

new Phaser.Game(config)