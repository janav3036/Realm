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
    backgroundColor: '#07060f',
    scene: [BootScene, LobbyScene, GameScene, UIScene, EndScene],
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    dom: {
        createContainer: true,
    },
};

const launch = () => new Phaser.Game(config);

// Wait for Google Fonts before creating the game so Phaser text renders correctly
if (document.fonts?.ready) {
    document.fonts.ready.then(launch);
} else {
    launch();
}
