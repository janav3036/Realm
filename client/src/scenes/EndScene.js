import Phaser from 'phaser';

const PLAYER_CSS = { red: '#c41e3a', blue: '#3a7bd5', green: '#27ae60', orange: '#e67e22' };

export default class EndScene extends Phaser.Scene {
    constructor() { super({ key: 'EndScene' }); }

    init(data) { this.state = data?.state ?? null; }

    create() {
        const { width, height } = this.scale;
        const cx = width / 2, cy = height / 2;
        const state  = this.state;
        if (!state) return;

        const winner = state.winner ? state.players[state.winner] : null;
        const winCol = winner ? (PLAYER_CSS[winner.color] ?? '#c9a227') : '#888899';

        // Dark vignette overlay
        this.add.rectangle(0, 0, width, height, 0x000000, 0.82).setOrigin(0, 0);

        // Ornate panel
        const PW = 500, PH = 460;
        const gfx = this.add.graphics();
        // Outer border
        gfx.lineStyle(1, 0xc9a227, 0.45);
        gfx.strokeRect(cx - PW/2, cy - PH/2, PW, PH);
        // Inner border
        gfx.lineStyle(1, 0x5a4010, 0.25);
        gfx.strokeRect(cx - PW/2 + 7, cy - PH/2 + 7, PW - 14, PH - 14);
        // Fill
        gfx.fillStyle(0x0a0918, 0.97);
        gfx.fillRect(cx - PW/2 + 1, cy - PH/2 + 1, PW - 2, PH - 2);

        // Corner ornaments
        [[-PW/2, -PH/2], [PW/2, -PH/2], [-PW/2, PH/2], [PW/2, PH/2]].forEach(([ox, oy]) => {
            this.add.text(cx + ox, cy + oy, '◆', {
                fontFamily: 'serif', fontSize: '9px', color: '#c9a227',
            }).setOrigin(0.5).setAlpha(0.4);
        });

        // Items to stagger in
        const items = [];

        // "The Campaign Ends" label
        const tag = this.add.text(cx, cy - PH/2 + 26, '✦   The Campaign Ends   ✦', {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '9px',
            color: '#5a4010',
            letterSpacing: 3,
        }).setOrigin(0.5).setAlpha(0);
        items.push(tag);

        // GAME OVER or A KING IS CROWNED
        const headline = winner ? 'A King is Crowned' : 'The Game is Ended';
        const headT = this.add.text(cx, cy - 160, headline, {
            fontFamily: '"Cinzel Decorative", Georgia, serif',
            fontSize: '32px',
            color: '#c9a227',
            stroke: '#07060f',
            strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(0);
        items.push(headT);

        // Winner name
        if (winner) {
            const winT = this.add.text(cx, cy - 92, winner.name, {
                fontFamily: '"Cinzel Decorative", Georgia, serif',
                fontSize: '52px',
                color: winCol,
                stroke: '#07060f',
                strokeThickness: 6,
            }).setOrigin(0.5).setAlpha(0);
            items.push(winT);
        } else {
            const hostT = this.add.text(cx, cy - 92, 'Ended by Host', {
                fontFamily: '"IM Fell English SC", Georgia, serif',
                fontSize: '28px',
                color: '#888899',
            }).setOrigin(0.5).setAlpha(0);
            items.push(hostT);
        }

        // Divider rule
        const ruleGfx = this.add.graphics().setAlpha(0);
        ruleGfx.lineStyle(1, 0x5a4010, 0.6);
        ruleGfx.lineBetween(cx - 180, cy - 32, cx + 180, cy - 32);
        this.add.text(cx, cy - 32, '◆', {
            fontFamily: 'serif', fontSize: '7px', color: '#5a4010',
        }).setOrigin(0.5).setAlpha(0);
        items.push(ruleGfx);

        // "Final Tally" label
        const tallyT = this.add.text(cx, cy - 18, 'FINAL TALLY', {
            fontFamily: '"Cinzel", Georgia, serif',
            fontSize: '8px',
            color: '#5a4010',
            letterSpacing: 5,
        }).setOrigin(0.5).setAlpha(0);
        items.push(tallyT);

        // Score rows
        state.player_order.forEach((pid, i) => {
            const p  = state.players[pid];
            const vp = p.victory_points + p.vp_cards
                + (state.longest_road_owner === pid ? 2 : 0)
                + (state.largest_army_owner === pid ? 2 : 0);
            const col    = PLAYER_CSS[p.color] ?? '#e8dcc8';
            const prefix = pid === state.winner ? '✦ ' : '    ';
            const suffix = pid === state.winner ? '  ★' : '';
            const scoreT = this.add.text(cx, cy + 8 + i * 36,
                `${prefix}${p.name}   —   ${vp} Victory Points${suffix}`, {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '16px',
                    color: col,
                }).setOrigin(0.5).setAlpha(0);
            items.push(scoreT);
        });

        // Return button
        const btnY   = cy + PH/2 - 44;
        const btnGfx = this.add.graphics().setAlpha(0);
        btnGfx.fillStyle(0x07060f, 1);
        btnGfx.fillRect(cx - 120, btnY - 18, 240, 36);
        btnGfx.lineStyle(1, 0xc9a227, 0.55);
        btnGfx.strokeRect(cx - 120, btnY - 18, 240, 36);
        const btnT = this.add.text(cx, btnY, 'Return to the Realm', {
            fontFamily: '"Cinzel Decorative", Georgia, serif',
            fontSize: '13px',
            color: '#c9a227',
            letterSpacing: 1,
        }).setOrigin(0.5).setAlpha(0);
        items.push(btnGfx, btnT);

        btnGfx.setInteractive(
            new Phaser.Geom.Rectangle(cx - 120, btnY - 18, 240, 36),
            Phaser.Geom.Rectangle.Contains
        );
        btnGfx.on('pointerover', () => { btnGfx.clear(); btnGfx.fillStyle(0x1a1628,1).fillRect(cx-120,btnY-18,240,36); btnGfx.lineStyle(1,0xf4d97b,0.7).strokeRect(cx-120,btnY-18,240,36); btnT.setColor('#f4d97b'); });
        btnGfx.on('pointerout',  () => { btnGfx.clear(); btnGfx.fillStyle(0x07060f,1).fillRect(cx-120,btnY-18,240,36); btnGfx.lineStyle(1,0xc9a227,0.55).strokeRect(cx-120,btnY-18,240,36); btnT.setColor('#c9a227'); });
        btnGfx.on('pointerdown', () => this.scene.start('LobbyScene'));

        // Staggered fade-in reveal
        items.forEach((obj, i) => {
            this.tweens.add({
                targets: obj,
                alpha: 1,
                duration: 500,
                delay: 300 + i * 140,
                ease: 'Power2',
            });
        });
    }
}
