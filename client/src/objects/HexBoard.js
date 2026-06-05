import { hexToPixel, HEX_SIZE } from '../utils/HexMath.js';
import { RESOURCE_COLORS, PLAYER_COLORS } from '../utils/Constants.js';

export default class HexBoard {
    constructor(scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics().setDepth(1);
        this.labels = [];
        this.tileImages = [];
    }

    render(board, players, robberHexId) {
        this.graphics.clear();
        this.tileImages.forEach(img => img.destroy());
        this.tileImages = [];
        this.labels.forEach(l => l.destroy());
        this.labels = [];


        const cx = this.scene.scale.width / 2;
        const cy = this.scene.scale.height / 2;

        // 1. Hex tiles (bottom layer)
        for (const hex of board.hexes) {
            this._drawHex(hex, cx, cy, hex.id === robberHexId);
        }

        // 2. Port labels on outer vertices
        for (const vertex of board.vertices) {
            if (vertex.port) this._drawPort(vertex, cx, cy);
        }

        // 3. Roads (drawn over tiles, under buildings)
        for (const edge of board.edges) {
            if (edge.road) {
                this._drawRoad(edge, board.vertices, cx, cy,
                    players[edge.road]?.color ?? 'red');
            }
        }

        // 4. Settlements and cities (top layer)
        for (const vertex of board.vertices) {
            if (vertex.building) {
                this._drawBuilding(vertex, cx, cy,
                    players[vertex.owner]?.color ?? 'red');
            }
        }
    }

    // ── hex tile ──────────────────────────────────────────────────

    _drawHex(hex, cx, cy, hasRobber) {
        const { x, y } = hexToPixel(hex.q, hex.r);
        const key = `tile_${hex.resource}`;

        const img = this.scene.add.image(cx + x, cy + y, key)
            .setDisplaySize(HEX_SIZE * 2.1, HEX_SIZE * 2.1);
        this.tileImages.push(img);

        // hex border
        const pts = this._hexPoints(cx + x, cy + y);
        this.graphics.lineStyle(5, 0x000000, 0.6);
        this.graphics.strokePoints(pts, true);

        if (hex.number) {
            const isHot = hex.number === 6 || hex.number === 8;
            this.labels.push(
                this.scene.add.text(cx + x, cy + y, String(hex.number), {
                    fontSize: '18px',
                    color: isHot ? '#cc0000' : '#ffffff',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 3,
                }).setOrigin(0.5)
            );
        }

        if (hasRobber) {
            this.labels.push(
                this.scene.add.text(cx + x, cy + y + 22, '🏴', {
                    fontSize: '20px',
                }).setOrigin(0.5)
            );
        }

    }

    _hexPoints(cx, cy) {
        return Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return { x: cx + HEX_SIZE * Math.cos(a), y: cy + HEX_SIZE * Math.sin(a) };
        });
    }

    // ── port label ────────────────────────────────────────────────

    _drawPort(vertex, cx, cy) {
        const px = vertex.pixel_x, py = vertex.pixel_y;
        const len = Math.sqrt(px * px + py * py) || 1;
        this.labels.push(
            this.scene.add.text(
                cx + px + (px / len) * 18,
                cy + py + (py / len) * 18,
                vertex.port,
                {
                    fontSize: '10px',
                    color: '#ffffff',
                    backgroundColor: '#000000bb',
                    padding: { x: 2, y: 1 },
                }
            ).setOrigin(0.5)
        );
    }

    // ── road ──────────────────────────────────────────────────────

    _drawRoad(edge, vertices, cx, cy, playerColor) {
        const v0 = vertices[edge.vertices[0]];
        const v1 = vertices[edge.vertices[1]];
        this.graphics.lineStyle(5, PLAYER_COLORS[playerColor] ?? 0xffffff, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(cx + v0.pixel_x, cy + v0.pixel_y);
        this.graphics.lineTo(cx + v1.pixel_x, cy + v1.pixel_y);
        this.graphics.strokePath();
    }

    // ── settlement / city ─────────────────────────────────────────

    _drawBuilding(vertex, cx, cy, playerColor) {
        const x = cx + vertex.pixel_x;
        const y = cy + vertex.pixel_y;
        const col = PLAYER_COLORS[playerColor] ?? 0xffffff;

        if (vertex.building === 'settlement') {
            this.graphics.fillStyle(col, 1);
            this.graphics.fillCircle(x, y, 10);
            this.graphics.lineStyle(2, 0x000000, 1);
            this.graphics.strokeCircle(x, y, 10);
        } else {
            // city — filled square, slightly larger
            this.graphics.fillStyle(col, 1);
            this.graphics.fillRect(x - 13, y - 13, 26, 26);
            this.graphics.lineStyle(2, 0x000000, 1);
            this.graphics.strokeRect(x - 13, y - 13, 26, 26);
        }
    }
}
