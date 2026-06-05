import { hexToPixel, HEX_SIZE } from '../utils/HexMath.js';
import { PLAYER_COLORS } from '../utils/Constants.js';

export default class HexBoard {
    constructor(scene) {
        this.scene      = scene;
        this.graphics   = scene.add.graphics().setDepth(2);
        this.labels     = [];
        this.tileImages = [];
    }

    // layout = { cx, cy, scale } — if null, defaults to full-canvas center, scale 1
    render(board, players, robberHexId, layout = null) {
        this.graphics.clear();
        this.tileImages.forEach(img => img.destroy());
        this.tileImages = [];
        this.labels.forEach(l => l.destroy());
        this.labels = [];

        const cx = layout?.cx ?? (this.scene.scale.width  / 2);
        const cy = layout?.cy ?? (this.scene.scale.height / 2);
        const sc = layout?.scale ?? 1;

        for (const hex of board.hexes) {
            this._drawHex(hex, cx, cy, sc, hex.id === robberHexId);
        }
        for (const vertex of board.vertices) {
            if (vertex.port) this._drawPort(vertex, cx, cy, sc);
        }
        for (const edge of board.edges) {
            if (edge.road) {
                this._drawRoad(edge, board.vertices, cx, cy, sc,
                    players[edge.road]?.color ?? 'red');
            }
        }
        for (const vertex of board.vertices) {
            if (vertex.building) {
                this._drawBuilding(vertex, cx, cy, sc,
                    players[vertex.owner]?.color ?? 'red');
            }
        }
    }

    // ── hex tile ──────────────────────────────────────────────────

    _drawHex(hex, cx, cy, sc, hasRobber) {
        const { x, y } = hexToPixel(hex.q, hex.r);
        const hx      = cx + x * sc;
        const hy      = cy + y * sc;
        const hexSize = HEX_SIZE * sc;
        const key     = `tile_${hex.resource}`;

        const img = this.scene.add.image(hx, hy, key)
            .setDisplaySize(hexSize * 2.1, hexSize * 2.1)
            .setDepth(0);
        this.tileImages.push(img);

        const pts = this._hexPoints(hx, hy, hexSize);
        this.graphics.lineStyle(Math.max(2, Math.round(12 * sc)), 0x1e1812, 1);
        this.graphics.strokePoints(pts, true);

        if (hex.number) {
            const isHot   = hex.number === 6 || hex.number === 8;
            const tokenBg = isHot ? 0x1a0000 : 0x07060f;
            const borderC = isHot ? 0x8b1520 : 0x5a4010;
            const textCol = isHot ? '#c41e3a' : '#e8dcc8';
            const r1      = Math.max(6, Math.round(16 * sc));
            const r2      = Math.max(8, Math.round(20 * sc));
            const fsize   = Math.max(8, Math.floor(14 * sc));

            this.graphics.fillStyle(tokenBg, 0.92);
            this.graphics.fillCircle(hx, hy, r1);
            this.graphics.lineStyle(1, borderC, 0.85);
            this.graphics.strokeCircle(hx, hy, r1);
            if (isHot) {
                this.graphics.lineStyle(1, borderC, 0.3);
                this.graphics.strokeCircle(hx, hy, r2);
            }

            this.labels.push(
                this.scene.add.text(hx, hy, String(hex.number), {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize:   `${fsize}px`,
                    color: textCol,
                    fontStyle: 'bold',
                    stroke: '#07060f',
                    strokeThickness: Math.max(1, Math.round(2 * sc)),
                }).setOrigin(0.5).setDepth(3)
            );
        }

        if (hasRobber) {
            const rsize  = Math.max(10, Math.floor(18 * sc));
            const offset = hex.number ? Math.max(14, Math.round(26 * sc)) : Math.max(3, Math.round(6 * sc));
            this.labels.push(
                this.scene.add.text(hx, hy + offset, '☠', {
                    fontFamily: 'serif',
                    fontSize:   `${rsize}px`,
                    color: '#8b1520',
                    stroke: '#07060f',
                    strokeThickness: Math.max(1, Math.round(3 * sc)),
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

    _drawPort(vertex, cx, cy, sc) {
        const px      = vertex.pixel_x * sc;
        const py      = vertex.pixel_y * sc;
        const len     = Math.sqrt(px * px + py * py) || 1;
        const off     = 22 * sc;
        const fsize   = Math.max(5, Math.floor(8 * sc));
        const portStr = vertex.port === '3:1'
            ? '⚓ 3:1'
            : `⚓ ${vertex.port.slice(0, 3).toUpperCase()}`;

        this.labels.push(
            this.scene.add.text(
                cx + px + (px / len) * off,
                cy + py + (py / len) * off,
                portStr,
                {
                    fontFamily: '"Cinzel", Georgia, serif',
                    fontSize:   `${fsize}px`,
                    color: '#c9a227',
                    stroke: '#07060f',
                    strokeThickness: Math.max(1, Math.round(3 * sc)),
                    padding: { x: 2, y: 1 },
                }
            ).setOrigin(0.5).setDepth(3)
        );
    }

    // ── road ──────────────────────────────────────────────────────

    _drawRoad(edge, vertices, cx, cy, sc, playerColor) {
        const v0 = vertices[edge.vertices[0]];
        const v1 = vertices[edge.vertices[1]];
        if (!v0 || !v1 || v0.pixel_x == null || v1.pixel_x == null) return;

        const col = PLAYER_COLORS[playerColor] ?? 0xe8dcc8;
        this.graphics.lineStyle(Math.max(2, Math.round(6 * sc)), col, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(cx + v0.pixel_x * sc, cy + v0.pixel_y * sc);
        this.graphics.lineTo(cx + v1.pixel_x * sc, cy + v1.pixel_y * sc);
        this.graphics.strokePath();
    }

    // ── settlement / city ─────────────────────────────────────────

    _drawBuilding(vertex, cx, cy, sc, playerColor) {
        if (vertex.pixel_x == null || vertex.pixel_y == null) return;
        const x   = cx + vertex.pixel_x * sc;
        const y   = cy + vertex.pixel_y * sc;
        const col = PLAYER_COLORS[playerColor] ?? 0xe8dcc8;

        if (vertex.building === 'settlement') {
            const r1 = Math.max(5, Math.round(12 * sc));
            const r2 = Math.max(3, Math.round(8 * sc));
            this.graphics.fillStyle(0x07060f, 1);
            this.graphics.fillCircle(x, y, r1);
            this.graphics.fillStyle(col, 1);
            this.graphics.fillCircle(x, y, r2);
            this.graphics.lineStyle(1, 0xc9a227, 0.55);
            this.graphics.strokeCircle(x, y, r1);
        } else {
            const s1 = Math.max(6, Math.round(13 * sc));
            const s2 = Math.max(4, Math.round(9 * sc));
            this.graphics.fillStyle(0x07060f, 1);
            this.graphics.fillRect(x - s1, y - s1, s1 * 2, s1 * 2);
            this.graphics.fillStyle(col, 1);
            this.graphics.fillRect(x - s2, y - s2, s2 * 2, s2 * 2);
            this.graphics.lineStyle(1, 0xc9a227, 0.75);
            this.graphics.strokeRect(x - s1, y - s1, s1 * 2, s1 * 2);
        }
    }
}
