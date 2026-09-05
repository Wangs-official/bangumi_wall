'use client'

import { memo } from 'react'
import { coverAt, coverSrcSet, subjectUrl, type WallItem } from '@/lib/bangumi'
import { renderSubtitle, renderTitle, type DisplayConfig } from '@/lib/display'
import { TypeIcon } from './TypeIcon'

/** 各尺寸档下卡片的大致 CSS 宽度，供 srcset 选档 */
const SIZES_ATTR = {
  sm: '(max-width: 640px) 30vw, 130px',
  md: '(max-width: 640px) 32vw, 170px',
  lg: '(max-width: 640px) 45vw, 230px',
} as const

function CoverCardInner({
  item,
  display,
  showTypeIcon,
}: {
  item: WallItem
  display: DisplayConfig
  showTypeIcon: boolean
}) {
  const title = renderTitle(item, display.titleMode)
  const subtitle = renderSubtitle(item, display.subtitleFields)
  const comment = display.showComment ? item.comment : ''
  const hasCaption = Boolean(title || subtitle || comment)
  // 交给浏览器按 DPR 挑档位。sizes 是格子的大致 CSS 宽度，
  // 2× 屏上 170px 的格子会自动升到 400 档，1× 屏仍然只拿 200 档。
  const cover = coverAt(item.cover, display.size === 'lg' ? 600 : 400)
  const srcSet = coverSrcSet(item.cover, [200, 400, 600])
  const sizes = SIZES_ATTR[display.size]
  const label = `${item.name}${item.originalName && item.originalName !== item.name ? ` / ${item.originalName}` : ''}`

  return (
    <a href={subjectUrl(item.id)} target="_blank" rel="noreferrer noopener" className="group block" title={label}>
      <div
        className="relative aspect-2/3 overflow-hidden rounded-lg transition-transform duration-200 group-hover:-translate-y-1"
        style={{ boxShadow: 'var(--shadow)', background: 'color-mix(in srgb, var(--fg) 8%, transparent)' }}
      >
        {cover ? (
          <img
            src={cover}
            srcSet={srcSet}
            sizes={sizes}
            alt={item.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>
            {item.name}
          </div>
        )}

        {showTypeIcon ? <TypeIcon type={item.subjectType} /> : null}

        {item.private ? (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] leading-none text-white">
            私
          </span>
        ) : null}

        {/* 悬停时才出现的短评，标题隐藏时也能知道是什么 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 to-transparent p-2 pt-8 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-2 text-[11px] leading-snug text-white/90">
            {item.comment || item.name}
          </p>
        </div>
      </div>

      {hasCaption ? (
        <div className="mt-1.5 text-center sm:mt-2">
          {title ? (
            // 不预留第二行高度，一行标题的卡片才不会和小标题之间空出一截
            <p className="line-clamp-2 text-[12px] leading-snug font-medium sm:text-[13px]" style={{ color: 'var(--fg)' }}>
              {title}
            </p>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 truncate text-[10px] sm:text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {subtitle}
            </p>
          ) : null}
          {comment ? (
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug sm:text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {comment}
            </p>
          ) : null}
        </div>
      ) : null}
    </a>
  )
}

export const CoverCard = memo(CoverCardInner)
