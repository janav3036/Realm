import { hexToPixel, HEX_SIZE } from '../utils/HexMath.js';
import { PLAYER_COLORS } from '../utils/Constants.js';

export default class HexBoard {
    constructor(scene) {
        this.scene      = scene;
        this.graphics   = scene.add.graphics().setDepth(2);
        this.labels     = [];
        this.tileImages = [];
    }

    render(board, players, robberHexId) {
        this.graphics.clear();
        this.tileImages.forEach(img => img.destroy());
        this.tileImages = [];
        this.labels.forEach(l => l.destroy());
        this.labels = [];

        const cx = this.scene.scale.width  / 2;
        const cy = this.scene.scale.height / 2;

        // 1. Hex tile images (depth 0 by default)
        for (const hex of board.hexes) {
            this._drawHex(hex, cx, cy, hex.id === robberHexId);
        }

        // 2. Port labels on outer vertices
        for (const vertex of board.vertices) {
            if (vertex.port) this._drawPort(vertex, cx, cy);
        }

        // 3. Roads (over tiles, under buildings)
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
            .setDisplaySize(HEX_SIZE * 2.1, HEX_SIZE * 2.1)
            .setDepth(0);
        this.tileImages.push(img);

        // Thick dark border — roads render inside this frame
        const pts = this._hexPoints(cx + x, cy + y);
        this.graphics.lineStyle(12, 0x1e1812, 1);
        this.graphics.strokePoints(pts, true);

        // Number token — coin style
        if (hex.number) {
            const isHot = hex.number === 6 || hex.number === 8;
            const tokenBg = isHot ? 0x1a0000 : 0x07060f;
            const borderC = isHot ? 0x8b1520 : 0x5a4010;
            const textCol = isHot ? '#c41e3a' : '#e8dcc8';

            // Coin circle
            this.graphics.fillStyle(tokenBg, 0.92);
            this.graphics.fillCircle(cx + x, cy + y, 16);
            this.graphics.lineStyle(1, borderC, 0.85);
            this.graphics.strokeCircle(cx + x, cy + y, 16);
            if (isHot) {
                this.graphics.lineStyle(1, borderC, 0.3);
                this.graphics.strokeCircle(cx + x, cy + y, 20);
            }

            this.labels.push(
                this.scene.add.text(cx + x, cy + y, String(hex.number), {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '14px',
                    color: textCol,
                    fontStyle: 'bold',
                    stroke: '#07060f',
                    strokeThickness: 2,
                }).setOrigin(0.5).setDepth(3)
            );
        }

        if (hasRobber) {
            this.labels.push(
                this.scene.add.text(cx + x, cy + y + (hex.number ? 26 : 6), '☠', {
                    fontFamily: 'serif',
                    fontSize: '18px',
                    color: '#8b1520',
                    stroke: '#07060f',
                    strokeThickness: 3,
                }).setOrigin(0.5).setDepth(3)
            );
        }
    }

    _hexPoints(cx, cy, size = HEX_SIZE) {
        return Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return { x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) };
        });
    }

    // ── port label ────────────────────────────────────────────────

    _drawPort(vertex, cx, cy) {
        const px  = vertex.pixel_x, py = vertex.pixel_y;
        const len = Math.sqrt(px * px + py * py) || 1;
        const portStr = vertex.port === '3:1'
            ? '⚓ 3:1'
            : `⚓ ${vertex.port.slice(0, 3).toUpperCase()}`;

        this.labels.push(
            this.scene.add.text(
                cx + px + (px / len) * 22,
                cy + py + (py / len) * 22,
                portStr,
                {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize: '8px',
                    color: '#c9a227',
                    stroke: '#07060f',
                    strokeThickness: 3,
                    padding: { x: 2, y: 1 },
                }
            ).setOrigin(0.5).setDepth(3)
        );
    }

    // ── road ──────────────────────────────────────────────────────

    _drawRoad(edge, vertices, cx, cy, playerColor) {
        const v0  = vertices[edge.vertices[0]];
        const v1  = vertices[edge.vertices[1]];
        const col = PLAYER_COLORS[playerColor] ?? 0xe8dcc8;

        // Road drawn inside the thick hex border frame — no outer stroke needed
        this.graphics.lineStyle(6, col, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(cx + v0.pixel_x, cy + v0.pixel_y);
        this.graphics.lineTo(cx + v1.pixel_x, cy + v1.pixel_y);
        this.graphics.strokePath();
    }

    // ── settlement / city ─────────────────────────────────────────

    _drawBuilding(vertex, cx, cy, playerColor) {
        const x   = cx + vertex.pixel_x;
        const y   = cy + vertex.pixel_y;
        const col = PLAYER_COLORS[playerColor] ?? 0xe8dcc8;

        if (vertex.building === 'settlement') {
            // Outer dark ring
            this.graphics.fillStyle(0x07060f, 1);
            this.graphics.fillCircle(x, y, 12);
            // Player colour fill
            this.graphics.fillStyle(col, 1);
            this.graphics.fillCircle(x, y, 8);
            // Gold outer stroke
            this.graphics.lineStyle(1, 0xc9a227, 0.55);
            this.graphics.strokeCircle(x, y, 12);
        } else {
            // City: layered squares
            this.graphics.fillStyle(0x07060f, 1);
            this.graphics.fillRect(x - 13, y - 13, 26, 26);
            this.graphics.fillStyle(col, 1);
            this.graphics.fillRect(x - 9,  y - 9,  18, 18);
            // Gold outer border
            this.graphics.lineStyle(1, 0xc9a227, 0.75);
            this.graphics.strokeRect(x - 13, y - 13, 26, 26);
        }
    }
}
