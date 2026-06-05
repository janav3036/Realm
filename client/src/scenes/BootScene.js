import Phaser from 'phaser';
import Network from '../network.js';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }
    preload() {
        this.load.image('tile_timber', 'assets/tiles/timber.png');
        this.load.image('tile_stone', 'assets/tiles/stone.png');
        this.load.image('tile_grain', 'assets/tiles/grain.png');
        this.load.image('tile_wool', 'assets/tiles/wool.png');
        this.load.image('tile_ore', 'assets/tiles/ore.png');
        this.load.image('tile_desert', 'assets/tiles/desert.png');
    }

    create() {
        Network.connect();

        const { width, height } = this.scale;

        this.add.text(width / 2, height / 2 - 20, 'REALM', {
            fontSize: '72px',
            color: '#e8d5a3',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 50, 'Connecting...', {
            fontSize: '20px',
            color: '#666688',
        }).setOrigin(0.5);

        this.time.delayedCall(1000, () => this.scene.start('LobbyScene'));
    }
}
