import Phaser from 'phaser';

const COLOR_MAP = { red: '#e74c3c', blue: '#3498db', green: '#2ecc71', orange: '#e67e22' };

export default class EndScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EndScene' });
    }

    init(data) {
        this.state = data?.state ?? null;
    }

    create() {
        const { width, height } = this.scale;
        const state = this.state;
        if (!state) return;

        const winner = state.winner ? state.players[state.winner] : null;
        const winCol = winner ? (COLOR_MAP[winner.color] ?? '#e8d5a3') : '#888899';

        // Dark overlay
        this.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0, 0);

        // Panel
        this.add.rectangle(width / 2, height / 2, 480, 420, 0x0d0d2e, 0.97)
            .setOrigin(0.5).setStrokeStyle(2, 0x3a3a6a);

        // Title
        this.add.text(width / 2, height / 2 - 170, 'GAME OVER', {
            fontSize: '42px', color: '#e8d5a3', fontStyle: 'bold',
        }).setOrigin(0.5);

        // Winner (or "Game ended" if host force-ended)
        this.add.text(width / 2, height / 2 - 110,
            winner ? `${winner.name} wins!` : 'Game ended by host', {
            fontSize: winner ? '48px' : '32px', color: winCol, fontStyle: 'bold',
        }).setOrigin(0.5);

        // Divider label
        this.add.text(width / 2, height / 2 - 50, 'Final Scores', {
            fontSize: '16px', color: '#555577',
        }).setOrigin(0.5);

        // Scores
        state.player_order.forEach((pid, i) => {
            const p  = state.players[pid];
            const vp = p.victory_points + p.vp_cards +
                (state.longest_road_owner === pid ? 2 : 0) +
                (state.largest_army_owner === pid ? 2 : 0);
            const col    = COLOR_MAP[p.color] ?? '#ffffff';
            const prefix = pid === state.winner ? '★ ' : '    ';
            this.add.text(width / 2, height / 2 - 10 + i * 34,
                `${prefix}${p.name}   ${vp} VP`, {
                    fontSize: '20px', color: col,
                }).setOrigin(0.5);
        });

        // Play Again button
        const btnY = height / 2 + 170;
        const btn = this.add.rectangle(width / 2, btnY, 200, 46, 0x3a7bd5, 1)
            .setOrigin(0.5).setInteractive({ cursor: 'pointer' });
        this.add.text(width / 2, btnY, 'Play Again', {
            fontSize: '20px', color: '#ffffff',
        }).setOrigin(0.5);

        btn.on('pointerover', () => btn.setAlpha(0.8));
        btn.on('pointerout',  () => btn.setAlpha(1));
        btn.on('pointerdown', () => this.scene.start('LobbyScene'));
    }
}
