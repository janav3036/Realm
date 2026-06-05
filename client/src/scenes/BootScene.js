import Phaser from 'phaser';
import Network from '../network.js';

export default class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'BootScene' }); }

    preload() {
        this.load.image('tile_timber', 'assets/tiles/timber.png');
        this.load.image('tile_stone',  'assets/tiles/stone.png');
        this.load.image('tile_grain',  'assets/tiles/grain.png');
        this.load.image('tile_wool',   'assets/tiles/wool.png');
        this.load.image('tile_ore',    'assets/tiles/ore.png');
        this.load.image('tile_desert', 'assets/tiles/desert.png');
    }

    create() {
        Network.connect();
        const { width, height } = this.scale;
        const cx = width / 2, cy = height / 2;

        const gfx = this.add.graphics();

        // Double horizontal rules — outer then inner
        [[80, 0.32], [75, 0.1]].forEach(([offset, alpha]) => {
            gfx.lineStyle(1, 0xc9a227, alpha);
            gfx.lineBetween(cx - 270, cy - offset, cx + 270, cy - offset);
            gfx.lineBetween(cx - 270, cy + offset, cx + 270, cy + offset);
        });

        // Corner diamond ornaments
        [[-270, -80], [270, -80], [-270, 80], [270, 80]].forEach(([ox, oy]) => {
            this.add.text(cx + ox, cy + oy, '◆', {
                fontFamily: 'serif',
                fontSize: '9px',
                color: '#c9a227',
            }).setOrigin(0.5).setAlpha(0.4);
        });

        // Tiny top sigil
        this.add.text(cx, cy - 90, '✦', {
            fontFamily: 'serif', fontSize: '11px', color: '#5a4010',
        }).setOrigin(0.5).setAlpha(0.5);

        // Main title
        const title = this.add.text(cx, cy - 10, 'REALM', {
            fontFamily: '"Cinzel Decorative", Georgia, serif',
            fontSize: '88px',
            color: '#c9a227',
            stroke: '#07060f',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0);

        // Subtitle rule and text
        const sub = this.add.text(cx, cy + 46, '✦   A Realm of Conquest & Cunning   ✦', {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '10px',
            color: '#5a4010',
            letterSpacing: 2,
        }).setOrigin(0.5).setAlpha(0);

        // Status line
        const status = this.add.text(cx, cy + 108, 'The Kingdom Stirs…', {
            fontFamily: '"IM Fell English SC", Georgia, serif',
            fontSize: '14px',
            color: '#3a2e18',
        }).setOrigin(0.5).setAlpha(0);

        // Staggered fade-in
        this.tweens.add({ targets: title,  alpha: 1, duration: 900, ease: 'Power2' });
        this.tweens.add({ targets: sub,    alpha: 1, duration: 700, delay: 350, ease: 'Power2' });
        this.tweens.add({ targets: status, alpha: 1, duration: 600, delay: 650, ease: 'Power2' });

        // Gentle gold pulse on title
        this.tweens.add({
            targets: title,
            alpha: { from: 0.80, to: 1 },
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: 900,
        });

        // Fade out then transition
        this.time.delayedCall(2400, () => {
            this.tweens.add({
                targets: [title, sub, status, gfx],
                alpha: 0,
                duration: 450,
                ease: 'Power2',
                onComplete: () => this.scene.start('LobbyScene'),
            });
        });
    }
}
