// Generates the app icons (PNG) into public/icons — run: node scripts/make-icons.mjs
// Pure Node (zlib only): a white calendar with a check mark on the brand teal.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const TEAL = [15, 118, 110] // #0f766e
const WHITE = [255, 255, 255]

// --- tiny PNG encoder -------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- shapes in unit coordinates (0..1), as signed distances ------------------
const roundRect = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.max(x0 + r - x, 0, x - (x1 - r))
  const cy = Math.max(y0 + r - y, 0, y - (y1 - r))
  const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1
  const d = Math.hypot(cx, cy) - r
  return inside && cx === 0 && cy === 0 ? -Math.min(x - x0, x1 - x, y - y0, y1 - y) : d
}
const segment = (x, y, ax, ay, bx, by) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - t * dx, py - t * dy)
}

/** Color of one point. `rounded`: transparent rounded corners (regular icon) vs full bleed (maskable). */
function shade(x, y, rounded) {
  if (rounded && roundRect(x, y, 0, 0, 1, 1, 0.22) > 0) return null
  const body = roundRect(x, y, 0.24, 0.29, 0.76, 0.77, 0.07)
  const ringL = roundRect(x, y, 0.345, 0.22, 0.405, 0.34, 0.03)
  const ringR = roundRect(x, y, 0.595, 0.22, 0.655, 0.34, 0.03)
  const header = y > 0.29 && y < 0.395 && body < 0
  const check = Math.min(segment(x, y, 0.37, 0.57, 0.465, 0.665), segment(x, y, 0.465, 0.665, 0.635, 0.48)) - 0.035
  if (ringL < 0 || ringR < 0) return WHITE
  if (body < 0) {
    if (header) return WHITE
    if (check < 0) return TEAL
    // inner white panel below the header, with a teal gap line under the header
    return y > 0.395 && y < 0.415 ? TEAL : WHITE
  }
  return TEAL
}

function render(size, rounded) {
  const SS = 4 // supersampling for smooth edges
  const out = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, rounded)
          if (!c) continue
          r += c[0]; g += c[1]; b += c[2]; a++
        }
      const i = (py * size + px) * 4
      if (a) {
        out[i] = r / a; out[i + 1] = g / a; out[i + 2] = b / a
      }
      out[i + 3] = Math.round((a / (SS * SS)) * 255)
    }
  return png(size, out)
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', render(192, true))
writeFileSync('public/icons/icon-512.png', render(512, true))
writeFileSync('public/icons/maskable-512.png', render(512, false))
writeFileSync('public/icons/apple-touch-icon.png', render(180, false)) // iOS rounds it itself
writeFileSync('public/icons/favicon-64.png', render(64, true))
console.log('icons written to public/icons')
