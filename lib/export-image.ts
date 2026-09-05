import { coverAt, type WallItem } from './bangumi'
import { renderSubtitle, renderTitle, type DisplayConfig } from './display'

/**
 * 把当前这面墙画成一张长图。
 *
 * 宽度固定为手机屏宽（主流 1080px），高度随条目数增长；每行 4 部。
 * 成图按 1:1 对应手机物理像素，所以字号也按物理像素给——1080 宽的图上 30px 的字，
 * 铺满 1080 物理像素的手机屏后约等于 11 个 CSS 像素，正好能看清。
 *
 * 封面图床（lain.bgm.tv / bgmimg.anibt.net）都返回 `Access-Control-Allow-Origin: *`，
 * 所以能直接 crossOrigin 加载后画进 canvas，不会污染画布，也就不用自建图片代理。
 */

/** 手机屏宽 */
const OUT_W = 1080
const COLS = 4
const PAD = 32
const GAP = 12
const CELL_W = Math.floor((OUT_W - PAD * 2 - GAP * (COLS - 1)) / COLS)

const HEADER_H = 190
const FOOTER_H = 90
const TITLE_LINE = 38
const SUB_LINE = 32

/** 浏览器 canvas 的单边像素上限，超过就画不出来（Chrome 是 65535，留足余量） */
const MAX_CANVAS_H = 32000

const JPEG_QUALITY = 0.95

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

/** 按当前字体把文本切成不超过 max 宽的若干行，最多 limit 行 */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, limit: number) {
  const lines: string[] = []
  let rest = text
  while (rest && lines.length < limit) {
    if (ctx.measureText(rest).width <= max) {
      lines.push(rest)
      break
    }
    let lo = 1
    let hi = rest.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (ctx.measureText(rest.slice(0, mid)).width <= max) lo = mid
      else hi = mid - 1
    }
    const isLast = lines.length === limit - 1
    lines.push(isLast ? ellipsize(ctx, rest.slice(0, lo), max) : rest.slice(0, lo))
    rest = rest.slice(lo)
  }
  return lines
}

/** 当前显示设置下每格的高度，以及画布高度上限决定的最大条目数 */
function metrics(display: DisplayConfig) {
  const coverH = Math.round((CELL_W * 3) / 2)
  const showTitle = display.titleMode !== 'hidden'
  const showSub = display.subtitleFields.length > 0
  const captionH = (showTitle ? TITLE_LINE * 2 : 0) + (showSub ? SUB_LINE : 0)
  const cellH = coverH + (captionH ? captionH + 10 : 0)
  const maxRows = Math.floor((MAX_CANVAS_H - HEADER_H - FOOTER_H - PAD) / (cellH + GAP))
  return { coverH, showTitle, showSub, cellH, maxItems: maxRows * COLS }
}

/** 供 UI 提前提示上限用 */
export function maxExportItems(display: DisplayConfig) {
  return metrics(display).maxItems
}

export interface ExportOptions {
  items: WallItem[]
  display: DisplayConfig
  /** 昵称，会拼成「XXX的班固米墙」 */
  who: string
  /** 副标题，比如「共 955 项 · 看过 / 在看」 */
  caption: string
  onProgress?: (loaded: number, total: number) => void
}

export async function renderWallImage({
  items,
  display,
  who,
  caption,
  onProgress,
}: ExportOptions): Promise<Blob> {
  const { coverH, showTitle, showSub, cellH, maxItems } = metrics(display)

  if (items.length > maxItems) {
    throw new Error(
      `条目太多画不下：每行 4 部时最多 ${maxItems} 项（受浏览器画布高度上限限制），当前 ${items.length} 项。先按类别或状态筛一下，或把标题设为「隐藏」以压缩每行高度。`,
    )
  }

  const rows = Math.ceil(items.length / COLS)
  const width = OUT_W
  const height = HEADER_H + rows * cellH + (rows - 1) * GAP + FOOTER_H + PAD

  // 用页面当前的配色，导出的图和屏幕上看到的一致
  const css = getComputedStyle(document.documentElement)
  const bg = css.getPropertyValue('--bg').trim() || '#eceff4'
  const fg = css.getPropertyValue('--fg').trim() || '#10151d'
  const muted = css.getPropertyValue('--fg-muted').trim() || '#64748b'
  const accent = css.getPropertyValue('--accent').trim() || '#ec4899'

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 canvas')
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 58px ${FONT}`
  // 昵称用强调色，「的班固米墙」用正文色，接着往后画
  ctx.fillStyle = accent
  ctx.fillText(who, PAD, 96)
  ctx.fillStyle = fg
  ctx.fillText('的班固米墙', PAD + ctx.measureText(who).width, 96)
  ctx.fillStyle = muted
  ctx.font = `28px ${FONT}`
  ctx.fillText(caption, PAD, 142)

  // 并发加载封面，边加载边画
  let cursor = 0
  let loaded = 0
  const CONCURRENCY = 12
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const idx = cursor++
        const item = items[idx]
        // 格子实占 245px，取 400 档绰绰有余
        const img = await loadImage(coverAt(item.cover, 400) ?? '')
        const x = PAD + (idx % COLS) * (CELL_W + GAP)
        const y = HEADER_H + Math.floor(idx / COLS) * (cellH + GAP)

        ctx.save()
        roundRect(ctx, x, y, CELL_W, coverH, 10)
        ctx.clip()
        if (img) {
          // object-fit: cover
          const s = Math.max(CELL_W / img.width, coverH / img.height)
          const dw = img.width * s
          const dh = img.height * s
          ctx.drawImage(img, x + (CELL_W - dw) / 2, y + (coverH - dh) / 2, dw, dh)
        } else {
          ctx.fillStyle = muted + '33'
          ctx.fillRect(x, y, CELL_W, coverH)
          ctx.fillStyle = muted
          ctx.font = `22px ${FONT}`
          ctx.textAlign = 'center'
          ctx.fillText(ellipsize(ctx, item.name, CELL_W - 20), x + CELL_W / 2, y + coverH / 2)
          ctx.textAlign = 'left'
        }
        ctx.restore()

        if (showTitle || showSub) {
          const cx = x + CELL_W / 2
          ctx.textAlign = 'center'
          let ty = y + coverH + 40

          if (showTitle) {
            ctx.fillStyle = fg
            ctx.font = `500 30px ${FONT}`
            for (const line of wrap(ctx, renderTitle(item, display.titleMode) ?? '', CELL_W, 2)) {
              ctx.fillText(line, cx, ty)
              ty += TITLE_LINE
            }
            // 不论标题占一行还是两行，小标题都对齐到同一基线
            ty = y + coverH + 40 + TITLE_LINE * 2
          }

          if (showSub) {
            const sub = renderSubtitle(item, display.subtitleFields)
            if (sub) {
              ctx.fillStyle = muted
              ctx.font = `24px ${FONT}`
              ctx.fillText(ellipsize(ctx, sub, CELL_W), cx, ty)
            }
          }
          ctx.textAlign = 'left'
        }

        onProgress?.(++loaded, items.length)
      }
    }),
  )

  ctx.fillStyle = muted
  ctx.font = `22px ${FONT}`
  ctx.fillText(`${new Date().toLocaleDateString('zh-CN')} · 数据来自 Bangumi`, PAD, height - PAD - 10)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('生成图片失败'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}
