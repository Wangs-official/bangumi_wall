import { coverAt } from './bangumi'

/** 喜好表导出成图。和封面墙导出共用一套 canvas 思路，但布局带题目行。 */

const CELL_W = 220
const GAP = 16
const PAD = 44
const LABEL_H = 34
const JPEG_QUALITY = 0.95
/** 喜好表格子数少，固定 2× 超采样，文字和封面都锐利 */
const SCALE = 2

interface CellData {
  label: string
  item: { id: number; name: string; cover: string | null } | null
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

export interface GridExportOptions {
  title: string
  who: string
  cols: number
  cells: CellData[]
  onProgress?: (loaded: number, total: number) => void
}

export async function renderGridImage({
  title,
  who,
  cols,
  cells,
  onProgress,
}: GridExportOptions): Promise<Blob> {
  const coverH = Math.round((CELL_W * 3) / 2)
  const cellH = coverH + LABEL_H
  const rows = Math.ceil(cells.length / cols)

  const headerH = 118
  const footerH = 64
  const width = PAD * 2 + cols * CELL_W + (cols - 1) * GAP
  const height = headerH + rows * cellH + (rows - 1) * GAP + footerH

  const css = getComputedStyle(document.documentElement)
  const bg = css.getPropertyValue('--bg').trim() || '#eceff4'
  const panel = css.getPropertyValue('--panel-solid').trim() || '#ffffff'
  const border = css.getPropertyValue('--border').trim() || 'rgba(15,23,42,0.08)'
  const fg = css.getPropertyValue('--fg').trim() || '#10151d'
  const muted = css.getPropertyValue('--fg-muted').trim() || '#64748b'
  const accent = css.getPropertyValue('--accent').trim() || '#ec4899'

  const canvas = document.createElement('canvas')
  canvas.width = width * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 canvas')
  ctx.scale(SCALE, SCALE)
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillStyle = fg
  ctx.font = `600 36px ${FONT}`
  ctx.fillText(title, width / 2, 62)
  ctx.fillStyle = accent
  ctx.font = `16px ${FONT}`
  ctx.fillText(`@${who}`, width / 2, 90)

  let cursor = 0
  let loaded = 0
  await Promise.all(
    Array.from({ length: Math.min(8, cells.length) }, async () => {
      while (cursor < cells.length) {
        const idx = cursor++
        const cell = cells[idx]
        const img = cell.item ? await loadImage(coverAt(cell.item.cover, 800) ?? '') : null

        const x = PAD + (idx % cols) * (CELL_W + GAP)
        const y = headerH + Math.floor(idx / cols) * (cellH + GAP)

        // 整格一个圆角框：上半是封面，下半是白底题目条（和页面上一致）
        ctx.save()
        roundRect(ctx, x, y, CELL_W, cellH, 10)
        ctx.clip()

        if (img) {
          const s = Math.max(CELL_W / img.width, coverH / img.height)
          ctx.drawImage(img, x + (CELL_W - img.width * s) / 2, y + (coverH - img.height * s) / 2, img.width * s, img.height * s)
        } else {
          ctx.fillStyle = muted + '22'
          ctx.fillRect(x, y, CELL_W, coverH)
          if (cell.item) {
            ctx.textAlign = 'center'
            ctx.fillStyle = muted
            ctx.font = `15px ${FONT}`
            ctx.fillText(ellipsize(ctx, cell.item.name, CELL_W - 20), x + CELL_W / 2, y + coverH / 2)
          }
        }

        ctx.fillStyle = panel
        ctx.fillRect(x, y + coverH, CELL_W, LABEL_H)
        ctx.textAlign = 'center'
        ctx.fillStyle = fg
        ctx.font = `600 17px ${FONT}`
        ctx.fillText(ellipsize(ctx, cell.label, CELL_W - 12), x + CELL_W / 2, y + coverH + 23)
        ctx.restore()

        ctx.strokeStyle = border
        ctx.lineWidth = 1
        roundRect(ctx, x + 0.5, y + 0.5, CELL_W - 1, cellH - 1, 10)
        ctx.stroke()

        onProgress?.(++loaded, cells.length)
      }
    }),
  )

  ctx.textAlign = 'center'
  ctx.fillStyle = muted
  ctx.font = `13px ${FONT}`
  ctx.fillText(
    '灵感来自 itorr/anime-grid · 数据来自 Bangumi · github.com/Wangs-official/bangumi_wall',
    width / 2,
    height - 26,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('生成图片失败'))), 'image/jpeg', JPEG_QUALITY)
  })
}
