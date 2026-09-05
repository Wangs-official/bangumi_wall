'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  COLLECTION_TYPE_LABEL,
  COLLECTION_TYPES,
  DEFAULT_SOURCE,
  SOURCES,
  SUBJECT_TYPE_LABEL,
  SUBJECT_TYPES,
  type SourceId,
  type WallItem,
} from '@/lib/bangumi'
import {
  DEFAULT_DISPLAY,
  SUBTITLE_FIELDS,
  type DisplayConfig,
  type SubtitleField,
  type TitleMode,
} from '@/lib/display'
import { renderWallImage } from '@/lib/export-image'
import { buildClusters } from '@/lib/series'
import { BAR_BTN, BAR_BTN_STYLE, Chip, ChipGroup, Divider } from './Chip'
import { CoverCard } from './CoverCard'
import { ListRow } from './ListRow'
import { useCollections } from './useCollections'
import { useSeries } from './useSeries'

const TITLE_MODES: { id: TitleMode; label: string }[] = [
  { id: 'cn', label: '中文名' },
  { id: 'original', label: '原名' },
  { id: 'hidden', label: '隐藏' },
]

const VIEWS: { id: DisplayConfig['view']; label: string }[] = [
  { id: 'grid', label: '封面墙' },
  { id: 'list', label: '列表' },
]

const SIZES: { id: DisplayConfig['size']; label: string }[] = [
  { id: 'sm', label: '小' },
  { id: 'md', label: '中' },
  { id: 'lg', label: '大' },
]

interface Me {
  username: string
  nickname: string
  avatar: string | null
  mode: 'username' | 'oauth'
}

const SORTS = [
  { id: 'collectedAt', label: '收藏时间' },
  { id: 'myRate', label: '我的评分' },
  { id: 'score', label: 'Bangumi 评分' },
  { id: 'rank', label: '排名' },
  { id: 'date', label: '发行日期' },
  { id: 'name', label: '名称' },
  { id: 'series', label: '同系列相邻' },
] as const
type SortId = (typeof SORTS)[number]['id']

/** 每档尺寸的最小列宽，手机一套、桌面一套 */
const GRID_MIN = {
  sm: { mobile: '88px', desktop: '112px' },
  md: { mobile: '108px', desktop: '150px' },
  lg: { mobile: '140px', desktop: '200px' },
} as const

/** 偏好都存在本地，换设备重来一次也无所谓。 */
function usePersisted<T extends object>(key: string, fallback: T, firstRun?: (f: T) => T) {
  // 首屏必须先渲染 fallback，否则服务端渲染结果和客户端对不上。
  const [value, setValue] = useState<T>(fallback)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      // 有存档就用存档，没有才让调用方按环境（比如屏幕宽度）挑默认值
      if (raw) setValue((v) => ({ ...v, ...JSON.parse(raw) }))
      else if (firstRun) setValue(firstRun)
    } catch {
      /* 读不到就用默认值 */
    }
    // 和上面的 setValue 在同一批次里生效，写回 effect 首次运行时读到的已经是存档值
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 无痕模式下写不了，忽略 */
    }
  }, [key, hydrated, value])

  return [value, setValue] as const
}

/** 「3 分钟前」这种相对时间 */
function sinceText(ts: number) {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

export function Wall({ me }: { me: Me }) {
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState('')
  const [syncOpen, setSyncOpen] = useState(false)
  const syncRef = useRef<HTMLDivElement>(null)

  const [prefs, setPrefs] = usePersisted('bw_prefs', {
    types: [] as number[], // 空 = 全部类别
    statuses: [2, 3] as number[], // 默认只看「看过 + 在看」，空 = 全部状态
    sort: 'collectedAt' as SortId,
    desc: true,
    toolbarOpen: false, // 默认收起，把第一屏让给封面
    source: DEFAULT_SOURCE as SourceId,
  })
  const [display, setDisplay] = usePersisted<DisplayConfig>('bw_display', DEFAULT_DISPLAY, (d) => ({
    ...d,
    // 手机屏幕默认小尺寸
    size: window.matchMedia('(max-width: 640px)').matches ? 'sm' : d.size,
  }))

  const collections = useCollections(me.username, prefs.source)
  const items = collections.items

  useEffect(() => {
    if (!syncOpen) return
    const onDown = (e: MouseEvent) => {
      if (!syncRef.current?.contains(e.target as Node)) setSyncOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [syncOpen])

  /** 各类别的条目数，用来在标签上显示角标 */
  const countsByType = useMemo(() => {
    const m = new Map<number, number>()
    for (const it of items ?? []) m.set(it.subjectType, (m.get(it.subjectType) ?? 0) + 1)
    return m
  }, [items])

  /** 筛选（不排序）—— 分组要在筛完之后做，排序要在分组之后做 */
  const filtered = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (prefs.types.length && !prefs.types.includes(it.subjectType)) return false
      if (prefs.statuses.length && !prefs.statuses.includes(it.status)) return false
      if (q && !`${it.name} ${it.originalName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, prefs.types, prefs.statuses, query])

  // 「同系列相邻」排序才需要去建关联图
  const seriesSort = prefs.sort === 'series'
  const series = useSeries(me.username, prefs.source, seriesSort)

  const visible = useMemo(() => {
    const key = (it: WallItem): string | number => {
      switch (prefs.sort) {
        case 'collectedAt':
        case 'series':
          return it.updatedAt ?? ''
        case 'myRate':
          return it.rate ?? -1
        case 'score':
          return it.score ?? -1
        case 'rank':
          return it.rank ?? Number.MAX_SAFE_INTEGER
        case 'date':
          return it.date ?? ''
        case 'name':
          return it.name
      }
    }
    const cmp = (a: WallItem, b: WallItem) => {
      const ka = key(a)
      const kb = key(b)
      const c =
        typeof ka === 'number' && typeof kb === 'number'
          ? ka - kb
          : String(ka).localeCompare(String(kb), 'zh-CN')
      // 排名越小越靠前，所以升降序反过来
      const dir = prefs.sort === 'rank' ? !prefs.desc : prefs.desc
      return dir ? -c : c
    }

    if (!seriesSort) return [...filtered].sort(cmp)

    // 系列内保持发行顺序（第一季在前），系列之间按各自最靠前的那部排
    const clusters = buildClusters(filtered, { byName: true, edges: series.edges })
    return clusters.sort((a, b) => cmp([...a].sort(cmp)[0], [...b].sort(cmp)[0])).flat()
  }, [filtered, prefs.sort, prefs.desc, seriesSort, series.edges])

  const backdrop = useMemo(() => visible.find((i) => i.cover)?.cover ?? null, [visible])

  // 只有同屏混着多个类别时，类别图标才有意义  // 只有同屏混着多个类别时，类别图标才有意义
  const mixedTypes = useMemo(() => new Set(filtered.map((i) => i.subjectType)).size > 1, [filtered])
  const showTypeIcon = display.showTypeIcon && mixedTypes

  const toggleType = (id: number) =>
    setPrefs((p) => ({
      ...p,
      types: p.types.includes(id) ? p.types.filter((t) => t !== id) : [...p.types, id],
    }))

  const toggleStatus = (id: number) =>
    setPrefs((p) => ({
      ...p,
      statuses: p.statuses.includes(id) ? p.statuses.filter((t) => t !== id) : [...p.statuses, id],
    }))

  const toggleField = (id: SubtitleField) =>
    setDisplay((d) => ({
      ...d,
      subtitleFields: d.subtitleFields.includes(id)
        ? d.subtitleFields.filter((f) => f !== id)
        : [...d.subtitleFields, id],
    }))

  const coverOnly = display.titleMode === 'hidden' && display.subtitleFields.length === 0

  async function exportImage() {
    if (!visible.length || exporting) return
    setExporting('准备中…')
    try {
      const parts = [`共 ${visible.length} 项`]
      if (prefs.types.length) parts.push(prefs.types.map((t) => SUBJECT_TYPE_LABEL[t]).join(' / '))
      if (prefs.statuses.length) parts.push(prefs.statuses.map((t) => COLLECTION_TYPE_LABEL[t]).join(' / '))

      const blob = await renderWallImage({
        items: visible,
        display,
        who: me.nickname,
        caption: parts.join(' · '),
        onProgress: (n, total) => setExporting(`绘制中 ${n}/${total}`),
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bangumi-wall-${me.username}-${new Date().toISOString().slice(0, 10)}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting('')
    }
  }

  async function unbind() {
    await fetch('/api/me', { method: 'DELETE' })
    location.reload()
  }

  return (
    <>
      {backdrop ? <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} /> : null}

      <div className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
        <header className="flex flex-wrap items-center gap-3 py-4 sm:py-6">
          <h1 className="text-xl font-semibold sm:mr-2 sm:text-2xl">封面墙</h1>

          <nav className="panel tab-scroll order-3 flex w-full items-center gap-1 rounded-full p-1 sm:order-2 sm:w-auto">
            <button className="pill" data-active={prefs.types.length === 0} onClick={() => setPrefs((p) => ({ ...p, types: [] }))}>
              全部
            </button>
            {SUBJECT_TYPES.map((t) => (
              <button key={t.id} className="pill" data-active={prefs.types.includes(t.id)} onClick={() => toggleType(t.id)}>
                {t.label}
                {countsByType.get(t.id) ? (
                  <span className="ml-1 text-[11px] opacity-50">{countsByType.get(t.id)}</span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="order-4 flex w-full items-center gap-2 sm:order-3 sm:w-auto">
            <Link href="/grid" className={BAR_BTN} style={BAR_BTN_STYLE}>
              喜好表
            </Link>

            <button
              onClick={exportImage}
              disabled={Boolean(exporting)}
              className={`${BAR_BTN} disabled:opacity-60`}
              style={BAR_BTN_STYLE}
            >
              {exporting || '导出长图'}
            </button>

            <div className="relative" ref={syncRef}>
              <button onClick={() => setSyncOpen((v) => !v)} className={BAR_BTN} style={BAR_BTN_STYLE}>
                {collections.revalidating ? '同步中…' : '同步 ▾'}
              </button>

              {syncOpen ? (
                <div
                  className="absolute top-full right-0 z-30 mt-2 w-40 rounded-xl border p-1.5"
                  style={{
                    background: 'var(--panel-solid)',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  <p className="px-2 pt-1 pb-1.5 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                    {collections.syncedAt ? `上次同步 ${sinceText(collections.syncedAt)}` : '尚未同步'}
                  </p>

                  <div className="mb-1 h-px" style={{ background: 'var(--border)' }} />

                  <p className="px-2 pt-1 pb-1.5 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                    更新源
                  </p>
                  {(Object.keys(SOURCES) as SourceId[]).map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        setPrefs((p) => ({ ...p, source: id }))
                        setSyncOpen(false)
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]"
                      style={{ color: 'var(--fg)' }}
                    >
                      {SOURCES[id].label}
                      {prefs.source === id ? <span style={{ color: 'var(--accent)' }}>✓</span> : null}
                    </button>
                  ))}

                  <div className="my-1.5 h-px" style={{ background: 'var(--border)' }} />

                  <button
                    onClick={() => {
                      collections.refresh()
                      setSyncOpen(false)
                    }}
                    disabled={collections.revalidating}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] disabled:opacity-50"
                    style={{ color: 'var(--fg)' }}
                  >
                    立即同步
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="order-2 ml-auto flex items-center gap-2 sm:order-4">
            {me.avatar ? (
              <img src={me.avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
            ) : null}
            <span className="hidden text-sm sm:inline" style={{ color: 'var(--fg-muted)' }}>
              {me.nickname}
            </span>
            <button
              onClick={unbind}
              className="rounded-lg px-2.5 py-1 text-xs transition-colors hover:opacity-80"
              style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg-muted)' }}
            >
              退出
            </button>
          </div>
        </header>

        {/* 所有显示选项直接铺在顶栏上，不藏进二级菜单；整块可折叠 */}
        {!prefs.toolbarOpen ? (
          <div className="mb-5 flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              共 {visible.length} 项
            </span>
            <span className="ml-auto">
              <Chip active={false} onClick={() => setPrefs((p) => ({ ...p, toolbarOpen: true }))}>
                展开更多设置 ▼
              </Chip>
            </span>
          </div>
        ) : (
        <div className="panel mb-4 rounded-2xl px-3 py-2.5 sm:mb-6 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-sm whitespace-nowrap" style={{ color: 'var(--fg-muted)' }}>
              共 {visible.length} 项
            </span>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索…"
              className="min-w-24 flex-1 rounded-lg px-3 py-1 text-xs outline-none sm:w-36 sm:flex-none"
              style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
            />

            <Divider />

            <ChipGroup label="状态">
              {COLLECTION_TYPES.map((t) => (
                <Chip key={t.id} active={prefs.statuses.includes(t.id)} onClick={() => toggleStatus(t.id)}>
                  {t.label}
                </Chip>
              ))}
            </ChipGroup>

            <Divider />

            <ChipGroup label="排序">
              <select
                value={prefs.sort}
                onChange={(e) => setPrefs((p) => ({ ...p, sort: e.target.value as SortId }))}
                className="cursor-pointer appearance-none rounded-lg px-2.5 py-1 text-xs font-medium outline-none"
                style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Chip active={false} onClick={() => setPrefs((p) => ({ ...p, desc: !p.desc }))}>
                {prefs.desc ? '↓ 降序' : '↑ 升序'}
              </Chip>
              {seriesSort && series.building ? (
                <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                  读取系列关联… {series.done}/{series.total}
                </span>
              ) : null}
              {seriesSort && !series.building && series.total > 0 ? (
                <Chip active={false} onClick={series.rebuild}>
                  重建关联
                </Chip>
              ) : null}
              {seriesSort && series.error ? (
                <span className="text-xs text-red-500">{series.error}</span>
              ) : null}
            </ChipGroup>

            <div className="ml-auto flex items-center gap-1.5">
              <Chip active={false} onClick={() => setPrefs((p) => ({ ...p, toolbarOpen: false }))}>
                收起 ▲
              </Chip>
            </div>
          </div>

          <div className="my-2.5 h-px sm:my-3" style={{ background: 'var(--border)' }} />

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <ChipGroup label="视图">
              {VIEWS.map((v) => (
                <Chip key={v.id} active={display.view === v.id} onClick={() => setDisplay((d) => ({ ...d, view: v.id }))}>
                  {v.label}
                </Chip>
              ))}
            </ChipGroup>

            <Divider />

            <ChipGroup label="标题">
              {TITLE_MODES.map((m) => (
                <Chip
                  key={m.id}
                  active={display.titleMode === m.id}
                  onClick={() => setDisplay((d) => ({ ...d, titleMode: m.id }))}
                >
                  {m.label}
                </Chip>
              ))}
            </ChipGroup>

            <Divider />

            <ChipGroup label="小标题">
              {SUBTITLE_FIELDS.map((f) => (
                <Chip key={f.id} active={display.subtitleFields.includes(f.id)} onClick={() => toggleField(f.id)}>
                  {f.label}
                </Chip>
              ))}
              <Chip
                active={display.showComment}
                onClick={() => setDisplay((d) => ({ ...d, showComment: !d.showComment }))}
              >
                吐槽
              </Chip>
            </ChipGroup>

            <Divider />

            <ChipGroup label="尺寸">
              {SIZES.map((z) => (
                <Chip key={z.id} active={display.size === z.id} onClick={() => setDisplay((d) => ({ ...d, size: z.id }))}>
                  {z.label}
                </Chip>
              ))}
            </ChipGroup>

            <Divider />

            <Chip
              active={coverOnly}
              onClick={() =>
                setDisplay((d) =>
                  coverOnly
                    ? { ...d, titleMode: 'cn', subtitleFields: ['year'] }
                    : { ...d, titleMode: 'hidden', subtitleFields: [] },
                )
              }
            >
              只显示封面
            </Chip>

            <Chip
              active={display.showTypeIcon}
              onClick={() => setDisplay((d) => ({ ...d, showTypeIcon: !d.showTypeIcon }))}
            >
              类别图标
            </Chip>

          </div>
        </div>
        )}

        {error || collections.error ? (
          <div className="panel rounded-xl p-4 text-sm text-red-500">{error || collections.error}</div>
        ) : collections.loading ? (
          <div
            className="wall-grid"
            style={
              {
                '--card-min': GRID_MIN[display.size].desktop,
                '--card-min-sm': GRID_MIN[display.size].mobile,
              } as React.CSSProperties
            }
          >
            {Array.from({ length: 24 }, (_, i) => (
              <div
                key={i}
                className="aspect-2/3 animate-pulse rounded-lg"
                style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)' }}
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="panel rounded-xl p-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
            没有符合条件的收藏
          </div>
        ) : display.view === 'list' ? (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {visible.map((item) => (
              <ListRow
                key={`${item.subjectType}-${item.id}`}
                item={item}
                display={display}
                showTypeIcon={showTypeIcon}
              />
            ))}
          </div>
        ) : (
          <div
            className="wall-grid"
            style={
              {
                '--card-min': GRID_MIN[display.size].desktop,
                '--card-min-sm': GRID_MIN[display.size].mobile,
              } as React.CSSProperties
            }
          >
            {visible.map((item) => (
              <CoverCard
                key={`${item.subjectType}-${item.id}`}
                item={item}
                display={display}
                showTypeIcon={showTypeIcon}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
