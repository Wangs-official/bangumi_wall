'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { COLLECTION_TYPES, coverAt, coverSrcSet, subjectUrl, type SourceId, type WallItem } from '@/lib/bangumi'
import {
  GRID_TITLE,
  GRID_TYPES,
  defaultGrid,
  loadGrid,
  newCell,
  saveGrid,
  type GridState,
} from '@/lib/grid'
import { renderGridImage } from '@/lib/export-grid'
import { BAR_BTN, BAR_BTN_STYLE } from './Chip'
import { ProgressBar } from './Progress'
import { useCollections } from './useCollections'

interface Me {
  username: string
  nickname: string
  avatar: string | null
  mode: 'username' | 'oauth'
}

/** 格子里可以放收藏里的条目，也可以放搜索来的条目 */
export interface Pick {
  id: number
  name: string
  cover: string | null
  date: string | null
}

const PICKS_KEY = (u: string) => `bw_grid_picks:${u}`

/** 搜索填进来的条目不在收藏里，得单独存一份才能在刷新后还画得出来 */
function loadPicks(username: string): Record<number, Pick> {
  try {
    return JSON.parse(localStorage.getItem(PICKS_KEY(username)) ?? '{}')
  } catch {
    return {}
  }
}

export function Grid({ me, source }: { me: Me; source: SourceId }) {
  const collections = useCollections(me.username, source)
  const [subjectType, setSubjectType] = useState(2)
  const [grid, setGrid] = useState<GridState | null>(null)
  const [extra, setExtra] = useState<Record<number, Pick>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<number[]>([])
  const [searchCell, setSearchCell] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<Pick[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [exporting, setExporting] = useState('')
  const [error, setError] = useState('')
  const hydrated = useRef(false)

  useEffect(() => {
    setGrid(loadGrid(me.username, subjectType))
    setExtra(loadPicks(me.username))
    hydrated.current = true
  }, [me.username, subjectType])

  useEffect(() => {
    if (!grid || !hydrated.current) return
    saveGrid(me.username, subjectType, grid)
  }, [grid, me.username, subjectType])

  const saveExtra = useCallback(
    (next: Record<number, Pick>) => {
      setExtra(next)
      try {
        localStorage.setItem(PICKS_KEY(me.username), JSON.stringify(next))
      } catch {
        /* 忽略 */
      }
    },
    [me.username],
  )

  /** 左栏：当前类别的收藏 */
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (collections.items ?? [])
      .filter((i) => i.subjectType === subjectType)
      .filter((i) => !status.length || status.includes(i.status))
      .filter((i) => !q || `${i.name} ${i.originalName}`.toLowerCase().includes(q))
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || b.updatedAt.localeCompare(a.updatedAt))
  }, [collections.items, subjectType, status, query])

  const byId = useMemo(() => {
    const m = new Map<number, Pick>()
    for (const i of collections.items ?? []) m.set(i.id, { id: i.id, name: i.name, cover: i.cover, date: i.date })
    for (const [id, p] of Object.entries(extra)) m.set(Number(id), p)
    return m
  }, [collections.items, extra])

  /** 每部作品被放进了几个格子 —— 可以多于一个 */
  const usedCount = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of grid?.cells ?? []) {
      if (c.itemId !== null) m.set(c.itemId, (m.get(c.itemId) ?? 0) + 1)
    }
    return m
  }, [grid])

  // 同一部作品可以同时是「最喜欢」和「最佳画面」，不去重
  function place(cellKey: string, itemId: number | null) {
    setGrid((g) =>
      g ? { ...g, cells: g.cells.map((c) => (c.key === cellKey ? { ...c, itemId } : c)) } : g,
    )
  }

  function swap(fromKey: string, toKey: string) {
    setGrid((g) => {
      if (!g) return g
      const a = g.cells.find((c) => c.key === fromKey)
      const b = g.cells.find((c) => c.key === toKey)
      if (!a || !b) return g
      return {
        ...g,
        cells: g.cells.map((c) =>
          c.key === fromKey ? { ...c, itemId: b.itemId } : c.key === toKey ? { ...c, itemId: a.itemId } : c,
        ),
      }
    })
  }

  async function runSearch(text: string) {
    const q = text.trim()
    if (!q) return
    setSearching(true)
    setSearchResults(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${subjectType}&source=${source}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '搜索失败')
      setSearchResults(data.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  function pickFromSearch(p: Pick) {
    if (!searchCell) return
    saveExtra({ ...extra, [p.id]: p })
    place(searchCell, p.id)
    setSearchCell(null)
    setSearchText('')
    setSearchResults(null)
  }

  async function exportImage() {
    if (!grid || exporting) return
    setExporting('绘制中…')
    try {
      const blob = await renderGridImage({
        title: GRID_TITLE[subjectType] ?? '生涯个人喜好表',
        who: me.nickname,
        cols: grid.cols,
        cells: grid.cells.map((c) => ({
          label: c.label,
          item: c.itemId !== null ? (byId.get(c.itemId) ?? null) : null,
        })),
        onProgress: (n, t) => setExporting(`绘制中 ${n}/${t}`),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${GRID_TITLE[subjectType] ?? 'grid'}-${me.username}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting('')
    }
  }

  if (!grid) return null

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center gap-3 py-4 sm:py-6">
        <h1 className="text-xl font-semibold sm:text-2xl">{GRID_TITLE[subjectType]}</h1>

<div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0">
          <Link href="/" className={BAR_BTN} style={BAR_BTN_STYLE}>
            ← 封面墙
          </Link>
          <Link href="/plan" className={BAR_BTN} style={BAR_BTN_STYLE}>
            时间线
          </Link>
          <button onClick={() => setGrid(defaultGrid(subjectType))} className={BAR_BTN} style={BAR_BTN_STYLE}>
            重置
          </button>
          <button
            onClick={exportImage}
            disabled={Boolean(exporting)}
            className={`${BAR_BTN} disabled:opacity-60`}
            style={BAR_BTN_STYLE}
          >
            {exporting || '导出图片'}
          </button>
        </div>

                <nav className="panel tab-scroll order-3 flex w-full items-center gap-1 rounded-full p-1 sm:order-3 sm:w-auto">
          {GRID_TYPES.map((t) => (
            <button
              key={t.id}
              className="pill"
              data-active={subjectType === t.id}
              onClick={() => setSubjectType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error ? <div className="panel mb-4 rounded-xl p-3 text-sm text-red-500">{error}</div> : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* 左栏：我的收藏，拖到右边格子里 */}
        <aside className="panel flex max-h-[70vh] w-full shrink-0 flex-col rounded-2xl p-3 lg:max-h-[calc(100vh-9rem)] lg:w-72 lg:sticky lg:top-4">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="在我的收藏里找…"
              className="min-w-0 flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
              style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
            />
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            {COLLECTION_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  setStatus((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))
                }
                className="rounded px-1.5 py-0.5 text-[11px] transition-colors"
                style={{
                  background: status.includes(t.id) ? 'var(--accent)' : 'color-mix(in srgb, var(--fg) 8%, transparent)',
                  color: status.includes(t.id) ? '#fff' : 'var(--fg-muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {collections.loading ? (
            <ProgressBar
              value={
                collections.progress && collections.progress.total > 0
                  ? collections.progress.loaded / collections.progress.total
                  : null
              }
              label={
                collections.progress
                  ? `正在获取收藏 ${collections.progress.loaded}/${collections.progress.total}`
                  : '正在获取收藏…'
              }
            />
          ) : (
            <p className="mb-2 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {`${pool.length} 部 · 拖到右边，或点选后再点格子`}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-3">
              {pool.slice(0, 400).map((it) => (
                <PoolItem
                  key={it.id}
                  item={it}
                  used={usedCount.get(it.id) ?? 0}
                  selected={selected === it.id}
                  onSelect={() => setSelected((s) => (s === it.id ? null : it.id))}
                />
              ))}
            </div>
            {pool.length > 400 ? (
              <p className="py-2 text-center text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                还有 {pool.length - 400} 部，用搜索缩小范围
              </p>
            ) : null}
          </div>
        </aside>

        {/* 右侧：格子 */}
        <main className="min-w-0 flex-1">
          <div
            className="grid gap-2 sm:gap-3"
            style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
          >
            {grid.cells.map((cell) => (
              <Cell
                key={cell.key}
                label={cell.label}
                item={cell.itemId !== null ? (byId.get(cell.itemId) ?? null) : null}
                onLabel={(label) =>
                  setGrid((g) => (g ? { ...g, cells: g.cells.map((c) => (c.key === cell.key ? { ...c, label } : c)) } : g))
                }
                onDropItem={(id) => {
                  place(cell.key, id)
                  setSelected(null)
                }}
                onDropCell={(fromKey) => swap(fromKey, cell.key)}
                onClickEmpty={() => {
                  if (selected !== null) {
                    place(cell.key, selected)
                    setSelected(null)
                  } else {
                    setSearchCell(cell.key)
                    setSearchText('')
                    setSearchResults(null)
                  }
                }}
                onClear={() => place(cell.key, null)}
                cellKey={cell.key}
                onRemove={
                  grid.cells.length > 1
                    ? () => setGrid((g) => (g ? { ...g, cells: g.cells.filter((c) => c.key !== cell.key) } : g))
                    : undefined
                }
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setGrid((g) => (g ? { ...g, cells: [...g.cells, newCell()] } : g))}
              className="rounded-lg px-2.5 py-1 text-xs transition-colors hover:opacity-80"
              style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
            >
              + 加一个题目
            </button>
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              列数
            </span>
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setGrid((g) => (g ? { ...g, cols: n } : g))}
                className="rounded-lg px-2 py-1 text-xs transition-colors"
                style={{
                  background: grid.cols === n ? 'var(--accent)' : 'color-mix(in srgb, var(--fg) 8%, transparent)',
                  color: grid.cols === n ? '#fff' : 'var(--fg)',
                }}
              >
                {n}
              </button>
            ))}
            <span className="ml-auto text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              题目可以直接点着改
            </span>
          </div>
        </main>
      </div>

      {/* 空格子点开的搜索框：收藏里没有的作品从这里找 */}
      {searchCell ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          onClick={() => setSearchCell(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-4"
            style={{ background: 'var(--panel-solid)', boxShadow: 'var(--shadow)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                runSearch(searchText)
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="在 Bangumi 搜索…"
                className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
              />
              <button
                type="submit"
                className="rounded-xl px-4 py-2 text-sm text-white"
                style={{ background: 'var(--accent)' }}
              >
                搜索
              </button>
            </form>

            <div className="mt-3 max-h-[50vh] overflow-y-auto">
              {searching ? (
                <p className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                  搜索中…
                </p>
              ) : searchResults === null ? (
                <p className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                  收藏里没有的作品，可以在这里搜全站
                </p>
              ) : searchResults.length === 0 ? (
                <p className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                  没有结果
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {searchResults.map((r) => (
                    <button key={r.id} onClick={() => pickFromSearch(r)} className="group text-left">
                      <div
                        className="aspect-2/3 overflow-hidden rounded-md"
                        style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)' }}
                      >
                        {r.cover ? (
                          <img
                            src={coverAt(r.cover, 200) ?? ''}
                            srcSet={coverSrcSet(r.cover, [100, 200, 400])}
                            sizes="(max-width: 640px) 22vw, 90px"
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug">{r.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="mt-10 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>
        灵感来自{' '}
        <a
          href="https://github.com/itorr/anime-grid"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 hover:opacity-70"
        >
          itorr/anime-grid
        </a>
        （动画生涯个人喜好表生成器）
      </footer>
    </div>
  )
}

function PoolItem({
  item,
  used,
  selected,
  onSelect,
}: {
  item: WallItem
  /** 已放进几个格子；可以多于一个，所以显示次数而不是变灰 */
  used: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/bw-item', String(item.id))}
      onClick={onSelect}
      title={used ? `${item.name}（已用在 ${used} 处）` : item.name}
      className="group relative block text-left"
    >
      {used ? (
        <span
          className="absolute top-1 right-1 z-10 rounded px-1 text-[10px] leading-[15px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {used > 1 ? used : '✓'}
        </span>
      ) : null}
      <div
        className="aspect-2/3 overflow-hidden rounded-md transition-all"
        style={{
          background: 'color-mix(in srgb, var(--fg) 8%, transparent)',
          outline: selected ? '2px solid var(--accent)' : 'none',
          outlineOffset: '2px',
        }}
      >
        {item.cover ? (
          <img
            src={coverAt(item.cover, 200) ?? ''}
            srcSet={coverSrcSet(item.cover, [100, 200, 400])}
            sizes="(max-width: 1024px) 22vw, 80px"
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
    </button>
  )
}

function Cell({
  cellKey,
  label,
  item,
  onLabel,
  onDropItem,
  onDropCell,
  onClickEmpty,
  onClear,
  onRemove,
}: {
  cellKey: string
  label: string
  item: Pick | null
  onLabel: (v: string) => void
  onDropItem: (id: number) => void
  onDropCell: (fromKey: string) => void
  onClickEmpty: () => void
  onClear: () => void
  onRemove?: () => void
}) {
  const [over, setOver] = useState(false)

  return (
    <div
      className="group/cell overflow-hidden rounded-lg"
      style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
    >
      <div
        draggable={Boolean(item)}
        onDragStart={(e) => e.dataTransfer.setData('text/bw-cell', cellKey)}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const id = e.dataTransfer.getData('text/bw-item')
          if (id) return onDropItem(Number(id))
          const from = e.dataTransfer.getData('text/bw-cell')
          if (from && from !== cellKey) onDropCell(from)
        }}
        onClick={() => {
          if (!item) onClickEmpty()
        }}
        className="relative aspect-2/3 transition-all"
        style={{
          background: 'color-mix(in srgb, var(--fg) 7%, transparent)',
          outline: over ? '2px dashed var(--accent)' : 'none',
          outlineOffset: '-3px',
          cursor: item ? 'grab' : 'pointer',
        }}
      >
        {item ? (
          <>
            {item.cover ? (
              <img
                src={coverAt(item.cover, 400) ?? ''}
                srcSet={coverSrcSet(item.cover, [200, 400, 600, 800])}
                sizes="(max-width: 640px) 30vw, 240px"
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center p-1 text-center text-[11px]">
                {item.name}
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 pt-6 opacity-0 transition-opacity group-hover/cell:opacity-100">
              <p className="line-clamp-2 text-[10px] leading-tight text-white">{item.name}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              className="absolute top-1 right-1 rounded bg-black/60 px-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover/cell:opacity-100"
              title="清空这一格"
            >
              ×
            </button>
            <a
              href={subjectUrl(item.id)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover/cell:opacity-100"
              title="在 Bangumi 打开"
            >
              ↗
            </a>
          </>
        ) : (
          <span
            className="flex h-full items-center justify-center text-[11px]"
            style={{ color: 'var(--fg-muted)' }}
          >
            拖入 / 点击搜索
          </span>
        )}
      </div>

      {/* 题目做成格子底部的白条，和原项目一样 */}
      <div className="relative" style={{ background: 'var(--panel-solid)' }}>
        <input
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          className="w-full bg-transparent px-1 py-1.5 text-center text-[12px] font-medium outline-none focus:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] sm:text-[13px]"
          style={{ color: 'var(--fg)' }}
        />
        {onRemove ? (
          <button
            onClick={onRemove}
            className="absolute top-1/2 right-1 -translate-y-1/2 px-1 text-[13px] leading-none opacity-0 transition-opacity group-hover/cell:opacity-100"
            style={{ color: 'var(--fg-muted)' }}
            title="删除此题"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}
