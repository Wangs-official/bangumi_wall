'use client'

import { memo } from 'react'
import { coverAt, coverSrcSet, subjectUrl, type WallItem } from '@/lib/bangumi'
import { renderSubtitleParts, renderTitle, type DisplayConfig, type SubtitleField } from '@/lib/display'
import { TypeIcon } from './TypeIcon'

/** 像 Emby 那样做成小方框的字段 */
const BOXED: SubtitleField[] = ['status', 'type']

function Meta({ item, fields }: { item: WallItem; fields: SubtitleField[] }) {
  const parts = renderSubtitleParts(item, fields)
  if (!parts.length) return null

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] sm:text-[13px]">
      {parts.map((p) =>
        p.id === 'score' ? (
          <span key={p.id} className="flex items-center gap-1" style={{ color: 'var(--fg)' }}>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="#e5484d" aria-hidden>
              <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5Z" />
            </svg>
            {p.text}
          </span>
        ) : BOXED.includes(p.id) ? (
          <span
            key={p.id}
            className="rounded-sm border px-1.5 py-px text-[11px] sm:text-[12px]"
            style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
          >
            {p.text}
          </span>
        ) : (
          <span key={p.id} style={{ color: 'var(--fg-muted)' }}>
            {p.text}
          </span>
        ),
      )}
    </div>
  )
}

function ListRowInner({
  item,
  display,
  showTypeIcon,
}: {
  item: WallItem
  display: DisplayConfig
  showTypeIcon: boolean
}) {
  // 列表里标题是主体，「隐藏标题」在这没有意义，退回中文名
  const title = renderTitle(item, display.titleMode === 'hidden' ? 'cn' : display.titleMode)
  const comment = display.showComment ? item.comment : ''
  const cover = coverAt(item.cover, 200) // 列表缩略图 70px 宽，2× 屏靠 srcset 升到 200/400

  return (
    <a
      href={subjectUrl(item.id)}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-4 px-1 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] sm:gap-5 sm:px-3"
    >
      <div
        className="relative aspect-2/3 w-14 shrink-0 overflow-hidden rounded-md sm:w-[70px]"
        style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', boxShadow: 'var(--shadow)' }}
      >
        {cover ? (
          <img
            src={cover}
            srcSet={coverSrcSet(item.cover, [100, 200, 400])}
            sizes="(max-width: 640px) 56px, 70px"
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : null}
        {showTypeIcon ? <TypeIcon type={item.subjectType} /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-snug sm:text-base" style={{ color: 'var(--fg)' }}>
          {title}
          {item.private ? (
            <span
              className="ml-1.5 rounded bg-black/55 px-1 py-px align-middle text-[10px] text-white"
              title="私有收藏"
            >
              私
            </span>
          ) : null}
        </p>

        <Meta item={item} fields={display.subtitleFields} />

        {comment ? (
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug sm:text-[13px]" style={{ color: 'var(--fg-muted)' }}>
            {comment}
          </p>
        ) : null}
      </div>
    </a>
  )
}

export const ListRow = memo(ListRowInner)
