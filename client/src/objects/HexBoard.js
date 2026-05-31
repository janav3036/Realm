import { hexToPixel, HEX_SIZE } from '../utils/HexMath.js'
import { RESOURCE_COLORS } from '../utils/Constants.js'

export default class HexBoard {
    constructor(scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics();
        this.labels = [];
    }

    render(board) {
        this.graphics.clear();
        this.labels.forEach(l => l.destroy());
        this.labels = [];

        const cx = this.scene.scale.width / 2;
        const cy = this.scene.scale.height / 2;

        for (const hex of board.hexes) {
            this._drawHex(hex, cx, cy);
        }
        for (const vertex of board.vertices) {
            if (vertex.port) {
                this._drawPort(vertex, cx, cy);
            }
        }
    }

    _drawHex(hex, cx, cy) {
        const { x, y } = hexToPixel(hex.q, hex.r);
        const color = RESOURCE_COLORS[hex.resource];

        const points = this._hexPoints(cx + x, cy + y);
        this.graphics.fillStyle(color, 1);
        this.graphics.fillPoints(points, true);
        this.graphics.lineStyle(2, 0x000000, 1);
        this.graphics.strokePoints(points, true);

        if (hex.number) {
            const isHot = hex.number === 6 || hex.number === 8;
            const label = this.scene.add.text(cx + x, cy + y, String(hex.number), {
                fontSize: '18px',
                color: isHot ? '#cc0000' : '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            this.labels.push(label);
        }

        if (hex.has_robber) {
            const robber = this.scene.add.text(cx + x, cy + y + 22, '🏴', {
                fontSize: '20px',
            }).setOrigin(0.5);
            this.labels.push(robber);
        }
    }

    _hexPoints(cx, cy) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            points.push({
                x: cx + HEX_SIZE * Math.cos(angle),
                y: cy + HEX_SIZE * Math.sin(angle)
            });
        }
        return points
    }

    _drawPort(vertex, cx, cy) {
        const px = cx + vertex.pixel_x;
        const py = cy + vertex.pixel_y;
        const label = this.scene.add.text(px, py, vertex.port, {
            fontSize: '10px',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 2, y: 2 },
        }).setOrigin(0.5);
        this.labels.push(label);
    }

}