'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { COLLECTION_TYPES, COLLECTION_TYPE_LABEL, coverAt, subjectUrl, type SourceId, type WallItem } from '@/lib/bangumi'
import {
  AIR_STATUS_LABEL,
  addDays,
  airStatus,
  diffDays,
  isOddDay,
  isoWeek,
  loadPlan,
  parseDay,
  relativeDayLabel,
  savePlan,
  shouldPrefetch,
  todayStr,
  watchedSet,
  weekdayOf,
  type AirStatus,
  type Episode,
  type PlanState,
} from '@/lib/plan'
import { BAR_BTN, BAR_BTN_STYLE } from './Chip'
import { ProgressBar } from './Progress'
import { useCollections } from './useCollections'
import { useEpisodes } from './useEpisodes'

interface Me {
  username: string
  nickname: string
  avatar: string | null
  mode: 'username' | 'oauth'
}

/** 缩放档位 = 每天占多宽 */
const ZOOMS = [
  { label: '周', w: 64 },
  { label: '月', w: 34 },
  { label: '季', w: 16 },
] as const

const ROW_H = 44
/** 右栏一次看几天 */
const PLAN_DAYS = 4
/** 手动排的集用的颜色，和连载（主题色）区分开 */
const MANUAL = '#6366f1'

/** 左栏状态筛选按钮的顺序：看过放在在看后面 */
const FILTER_ORDER = [1, 3, 2, 4, 5].map((id) => COLLECTION_TYPES.find((t) => t.id === id)!)

/** 日期条纹：单双日交替深浅 */
const ZEBRA = 'color-mix(in srgb, var(--fg) 5%, transparent)'
/** 周与周之间的分隔线，比日与日之间明显 */
const WEEK_LINE = 'color-mix(in srgb, var(--fg) 22%, transparent)'

const STATUS_RANK: Record<AirStatus, number> = { airing: 0, upcoming: 1, ended: 2, unknown: 3 }

interface Row {
  item: WallItem
  eps: Episode[]
  status: AirStatus
  /** 连载中或未开播：集按放送日自动上时间线 */
  live: boolean
  watched: Set<number>
  /** 日期 → 那天要看的集 */
  dates: Map<string, Episode[]>
  /** 还没排上日子、也没看过的集 */
  tray: Episode[]
  /** 有几集是用户手动排过日子的 */
  manual: number
  nextAir: string | null
}

interface Picked {
  sid: number
  ids: number[]
}

interface Dragging extends Picked {
  /** 里面有自己排的集：拖到空白处松手就把这些排期删掉 */
  manual: boolean
}

/** 「3」「3-5」「3集」；compact 用在窄格子里：「3+」 */
function rangeLabel(eps: Episode[], compact = false) {
  const s = eps.map((e) => e.sort).sort((a, b) => a - b)
  if (s.length === 1) return String(s[0])
  if (compact) return `${s[0]}+`
  const consecutive = s.every((v, i) => i === 0 || v - s[i - 1] === 1)
  return consecutive ? `${s[0]}-${s[s.length - 1]}` : `${s.length}集`
}

function epLabel(eps: Episode[]) {
  const r = rangeLabel(eps)
  return r.endsWith('集') ? r : `第${r}话`
}

function shortDate(d: string) {
  const x = parseDay(d)
  return `${x.getMonth() + 1}/${x.getDate()}`
}

export function Plan({ me, source }: { me: Me; source: SourceId }) {
  const collections = useCollections(me.username, source)
  const [plan, setPlan] = useState<PlanState | null>(null)
  const [today, setToday] = useState('')
  /** 右栏从哪天开始看；点时间线上的某天即切过去 */
  const [focus, setFocus] = useState('')
  const [dayW, setDayW] = useState<number>(ZOOMS[1].w)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<number[]>([3, 1])
  /** 待排栏手动展开／收起的记录，没记录的按默认规则 */
  const [trayOpen, setTrayOpen] = useState<Record<number, boolean>>({})
  /** 点选模式（手机上没有拖拽）：先点集，再点那一行的某天 */
  const [picked, setPicked] = useState<Picked | null>(null)
  const [hover, setHover] = useState<{ sid: number; idx: number } | null>(null)
  const [toast, setToast] = useState('')
  const [viewW, setViewW] = useState(0)
  /** 时间线里表头 + 各行之下还空着多高，用「未使用」的空行补满 */
  const [spare, setSpare] = useState(0)
  const headRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Dragging | null>(null)
  /** 正拖着自己排的集块，显示「拖到空白处删除」提示 */
  const [draggingManual, setDraggingManual] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrolledOnce = useRef(false)

  // 「今天」只能在浏览器里算，服务端的时区不一定是用户的
  useEffect(() => {
    const t = todayStr()
    setToday(t)
    setFocus(t)
    setPlan(loadPlan(me.username))
  }, [me.username])

  useEffect(() => {
    if (plan) savePlan(me.username, plan)
  }, [plan, me.username])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const anime = useMemo(() => (collections.items ?? []).filter((i) => i.subjectType === 2), [collections.items])
  const byId = useMemo(() => new Map(anime.map((i) => [i.id, i])), [anime])

  /** 要取剧集的条目：勾上的优先，然后在看、想看里的新番 */
  const wantIds = useMemo(() => {
    if (!plan || !today) return []
    const picks = Object.entries(plan.picks)
      .filter(([id, v]) => v && byId.has(Number(id)))
      .map(([id]) => Number(id))
      .sort((a, b) => a - b)
    const rest = anime
      .filter((i) => shouldPrefetch(i, today) && !plan.picks[i.id])
      .sort((a, b) => b.status - a.status || (b.date ?? '').localeCompare(a.date ?? '') || a.id - b.id)
      .map((i) => i.id)
    return [...picks, ...rest]
  }, [anime, byId, plan, today])

  const eps = useEpisodes(wantIds, source)
  const episodes = eps.episodes

  const statusOf = useCallback((id: number) => airStatus(episodes[id], today), [episodes, today])

  const isPicked = useCallback(
    (i: WallItem) => {
      const manual = plan?.picks[i.id]
      if (manual !== undefined) return manual
      // 默认：在看／想看里还在播（或快开播）的；已经完结的交给用户自己勾
      const s = statusOf(i.id)
      return (i.status === 1 || i.status === 3) && (s === 'airing' || s === 'upcoming')
    },
    [plan, statusOf],
  )

  const rows = useMemo<Row[]>(() => {
    if (!plan || !today) return []
    return anime
      .filter(isPicked)
      .map((item) => {
        const list = [...(episodes[item.id] ?? [])].sort((a, b) => a.sort - b.sort)
        const status = statusOf(item.id)
        const live = status === 'airing' || status === 'upcoming'
        const watched = watchedSet(list, item.epStatus)
        const dates = new Map<string, Episode[]>()
        const tray: Episode[] = []
        for (const e of list) {
          const d = plan.schedule[e.id] ?? (live ? e.airdate : null)
          if (d) dates.set(d, [...(dates.get(d) ?? []), e])
          else if (!watched.has(e.id) && !(live && !e.airdate)) tray.push(e)
        }
        const nextAir = live ? (list.find((e) => e.airdate && e.airdate >= today)?.airdate ?? null) : null
        const manual = list.filter((e) => plan.schedule[e.id] !== undefined).length
        return { item, eps: list, status, live, watched, dates, tray, manual, nextAir }
      })
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          (a.nextAir ?? '9').localeCompare(b.nextAir ?? '9') ||
          b.item.updatedAt.localeCompare(a.item.updatedAt),
      )
  }, [anime, episodes, isPicked, plan, statusOf, today])

  // ---- 时间线范围：两周前到两个多月后，排得更远就跟着延长 ----
  const { start, days } = useMemo(() => {
    if (!today) return { start: '', days: [] as string[] }
    let s = addDays(today, -14)
    let e = addDays(today, 75)
    const cap = addDays(today, 365)
    for (const r of rows) for (const d of r.dates.keys()) if (d > e && d <= cap) e = d
    if (focus && focus < s) s = addDays(focus, -7)
    if (focus && diffDays(focus, e) < 14) e = addDays(focus, 14)
    const n = diffDays(s, e) + 1
    return { start: s, days: Array.from({ length: n }, (_, i) => addDays(s, i)) }
  }, [today, rows, focus])

  const dayIdx = useCallback((d: string) => diffDays(start, d), [start])

  // 待排栏要横跨可视区域，得知道滚动容器多宽
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setViewW(el.clientWidth)
      const used = (headRef.current?.offsetHeight ?? 0) + (rowsRef.current?.offsetHeight ?? 0)
      // 横向滚动条也占高度，clientHeight 已经扣掉了
      setSpare(Math.max(0, el.clientHeight - used))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (rowsRef.current) ro.observe(rowsRef.current)
    return () => ro.disconnect()
  }, [plan])

  // 选中的日子滚到视野里；第一次进来把今天放在靠左的位置
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !focus || !start || !days.length) return
    const labelW = parseFloat(getComputedStyle(el).getPropertyValue('--label-w')) || 0
    const idx = dayIdx(focus)
    const left = idx * dayW
    const visible = el.scrollLeft <= left && left + dayW <= el.scrollLeft + el.clientWidth - labelW
    if (!scrolledOnce.current) {
      el.scrollLeft = Math.max(0, (idx - 3) * dayW)
      scrolledOnce.current = true
    } else if (!visible) {
      el.scrollTo({ left: Math.max(0, (idx - 3) * dayW), behavior: 'smooth' })
    }
  }, [focus, dayW, start, days.length, dayIdx])

  // ---- 修改排期 ----

  function place(sid: number, ids: number[], date: string) {
    const row = rows.find((r) => r.item.id === sid)
    if (!row || !plan) return
    const next = { ...plan.schedule }
    const early: Episode[] = []
    for (const id of ids) {
      const ep = row.eps.find((e) => e.id === id)
      if (!ep) continue
      // 还没播的集不能排在首播之前
      if (ep.airdate && date < ep.airdate) {
        early.push(ep)
        continue
      }
      if (row.live && ep.airdate === date) delete next[id]
      else next[id] = date
    }
    setPlan({ ...plan, schedule: next })
    if (early.length) {
      setToast(`${epLabel(early)} ${shortDate(early[0].airdate!)} 才播出，不能排在那之前`)
    }
  }

  // 用函数式更新：下面的全局 drop 监听只注册一次，拿不到最新的 plan
  const unschedule = useCallback((ids: number[]) => {
    setPlan((p) => {
      if (!p) return p
      const next = { ...p.schedule }
      for (const id of ids) delete next[id]
      return { ...p, schedule: next }
    })
  }, [])

  function endDrag() {
    dragRef.current = null
    setHover(null)
    setDraggingManual(false)
  }

  // 自己排的集块拖到时间线行和待排栏以外的任何地方松手 = 删掉排期
  useEffect(() => {
    const outside = (e: DragEvent) => !(e.target as Element | null)?.closest?.('[data-drop-zone]')
    const over = (e: DragEvent) => {
      if (!dragRef.current?.manual || !outside(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    }
    const drop = (e: DragEvent) => {
      const d = dragRef.current
      if (!d?.manual || !outside(e)) return
      e.preventDefault()
      unschedule(d.ids)
      setPicked(null)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [unschedule])

  /** 把待排的集从选中那天起，每天 n 集往后排 */
  function autoSchedule(row: Row, perDay: number) {
    if (!plan || !row.tray.length) return
    const next = { ...plan.schedule }
    let d = focus < today ? today : focus
    let count = 0
    for (const ep of row.tray) {
      if (count >= perDay) {
        d = addDays(d, 1)
        count = 0
      }
      if (ep.airdate && ep.airdate > d) {
        d = ep.airdate
        count = 0
      }
      next[ep.id] = d
      count++
    }
    setPlan({ ...plan, schedule: next })
    setTrayOpen((o) => ({ ...o, [row.item.id]: false }))
  }

  function clearRow(row: Row) {
    if (!plan) return
    const next = { ...plan.schedule }
    for (const e of row.eps) delete next[e.id]
    setPlan({ ...plan, schedule: next })
  }

  function togglePick(i: WallItem) {
    if (!plan) return
    setPlan({ ...plan, picks: { ...plan.picks, [i.id]: !isPicked(i) } })
    if (picked?.sid === i.id) setPicked(null)
  }

  // ---- 左栏 ----
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase()
    return anime
      .filter((i) => statusFilter.includes(i.status))
      .filter((i) => !q || `${i.name} ${i.originalName}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(isPicked(b)) - Number(isPicked(a)) ||
          STATUS_RANK[statusOf(a.id)] - STATUS_RANK[statusOf(b.id)] ||
          b.updatedAt.localeCompare(a.updatedAt),
      )
  }, [anime, statusFilter, query, isPicked, statusOf])

  // ---- 右栏 ----
  const planDays = useMemo(() => {
    if (!focus) return []
    return Array.from({ length: PLAN_DAYS }, (_, n) => {
      const day = addDays(focus, n)
      const entries = rows
        .flatMap((r) => {
          const list = r.dates.get(day)
          return list ? [{ row: r, eps: list }] : []
        })
        .sort((a, b) => Number(b.row.live) - Number(a.row.live))
      return { day, entries }
    })
  }, [focus, rows])

  if (!plan || !today) return null

  const pickedRow = picked ? rows.find((r) => r.item.id === picked.sid) : undefined
  const pickedEps = pickedRow ? pickedRow.eps.filter((e) => picked!.ids.includes(e.id)) : []
  const loadingCollections = collections.loading
  const colProgress = collections.progress

  return (
    <div className="mx-auto max-w-[1800px] px-4 pb-16 sm:px-8 md:flex md:h-dvh md:max-w-none md:flex-col md:overflow-hidden md:bg-[var(--panel-solid)] md:p-0">
      <header className="flex shrink-0 flex-wrap items-center gap-3 py-4 sm:py-6 md:border-b md:px-4 md:py-2.5 border-[color:var(--border)]">
        <h1 className="text-xl font-semibold sm:text-2xl md:text-lg">看番时间线</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/" className={BAR_BTN} style={BAR_BTN_STYLE}>
            ← 封面墙
          </Link>
          <Link href="/grid" className={BAR_BTN} style={BAR_BTN_STYLE}>
            喜好表
          </Link>
        </div>
      </header>

      {collections.error && !collections.items ? (
        <div className="panel mb-4 shrink-0 rounded-xl p-3 text-sm text-red-500 md:m-0 md:rounded-none md:border-0 md:px-4 md:py-2">{collections.error}</div>
      ) : null}
      {eps.error ? (
        <div className="panel mb-4 shrink-0 rounded-xl p-3 text-sm text-red-500 md:m-0 md:rounded-none md:border-0 md:px-4 md:py-2">{eps.error}</div>
      ) : null}

      {/* 手机一列、卡片式；从 md 起铺满一屏不滚动，各栏贴边用分隔线隔开，只在栏内滚。
          中等宽度左栏 + 主栏（计划横排在时间线上方），很宽时计划挪到右栏 */}
      <div className="grid grid-cols-1 gap-5 md:min-h-0 md:flex-1 md:gap-0 md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)_19rem] 2xl:grid-rows-[minmax(0,1fr)]">
        {/* 左栏：勾选要排的番 */}
        <aside className="panel order-3 flex max-h-[70vh] min-w-0 flex-col rounded-2xl p-3 md:rounded-none md:border-0 md:border-r md:bg-transparent md:backdrop-blur-none border-[color:var(--border)] md:col-start-1 md:row-span-2 md:row-start-1 md:max-h-none 2xl:row-span-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="在我的动画收藏里找…"
            className="mb-2 rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
          />
          <div className="mb-2 flex flex-wrap gap-1">
            {FILTER_ORDER.map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  setStatusFilter((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))
                }
                className="rounded px-1.5 py-0.5 text-[11px] transition-colors"
                style={{
                  background: statusFilter.includes(t.id)
                    ? 'var(--accent)'
                    : 'color-mix(in srgb, var(--fg) 8%, transparent)',
                  color: statusFilter.includes(t.id) ? '#fff' : 'var(--fg-muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loadingCollections ? (
            <ProgressBar
              value={colProgress && colProgress.total > 0 ? colProgress.loaded / colProgress.total : null}
              label={colProgress ? `正在获取收藏 ${colProgress.loaded}/${colProgress.total}` : '正在获取收藏…'}
            />
          ) : eps.progress ? (
            <ProgressBar
              value={eps.progress.loaded / eps.progress.total}
              label={`正在获取放送日期 ${eps.progress.loaded}/${eps.progress.total}`}
            />
          ) : (
            <p className="mb-2 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              已选 {rows.length} 部 · 默认勾上还在播的
            </p>
          )}

          <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {pool.slice(0, 300).map((i) => {
              const on = isPicked(i)
              const s: AirStatus | null = episodes[i.id] ? statusOf(i.id) : null
              return (
                <button
                  key={i.id}
                  onClick={() => togglePick(i)}
                  aria-pressed={on}
                  // 选中的整行铺一层主题色底，不再单画勾选框
                  className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${on ? '' : 'hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]'}`}
                  style={
                    on
                      ? {
                          background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)',
                        }
                      : undefined
                  }
                >
                  <Cover url={i.cover} w={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{i.name}</span>
                    <span className="block text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                      {COLLECTION_TYPE_LABEL[i.status]}
                      {i.date ? ` · ${i.date.slice(0, 7)}` : ''}
                    </span>
                  </span>
                  {s ? <StatusBadge status={s} /> : null}
                </button>
              )
            })}
            {pool.length > 300 ? (
              <p className="py-2 text-center text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                还有 {pool.length - 300} 部，用搜索缩小范围
              </p>
            ) : null}
            {!loadingCollections && !pool.length ? (
              <p className="py-6 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>
                没有符合条件的动画
              </p>
            ) : null}
          </div>
        </aside>

        {/* 中间：时间线 */}
        <main className="order-2 flex min-h-0 min-w-0 flex-col md:col-start-2 md:row-start-2 2xl:row-start-1">
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 md:mb-0 md:border-b md:px-3 md:py-2 border-[color:var(--border)]">
            <div className="panel flex items-center gap-0.5 rounded-full p-0.5">
              {ZOOMS.map((z) => (
                <button key={z.label} className="pill !py-0.5" data-active={dayW === z.w} onClick={() => setDayW(z.w)}>
                  {z.label}
                </button>
              ))}
            </div>
            <button onClick={() => setFocus(today)} className={BAR_BTN} style={BAR_BTN_STYLE}>
              今天
            </button>
            <span className="ml-auto flex items-center gap-3 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              <Legend color="var(--accent)" label="连载放送" />
              <Legend color={MANUAL} label="自己排的" />
              <span className="hidden sm:inline">拖动集块换日子，点日期看当天计划</span>
            </span>
          </div>

          <div
            ref={scrollRef}
            className="timeline panel no-scrollbar relative max-h-[70vh] overflow-auto rounded-2xl md:max-h-none md:min-h-0 md:flex-1 md:rounded-none md:border-0 md:bg-transparent md:backdrop-blur-none"
            style={{ overscrollBehaviorX: 'contain' }}
          >
            <div className="relative" style={{ width: `calc(var(--label-w) + ${days.length * dayW}px)` }}>
              {/* 表头：月份 / 第几周 / 日期 + 周几，点日期即选中那天 */}
              <div
                ref={headRef}
                className="sticky top-0 z-20 flex"
                style={{ background: 'var(--panel-solid)', borderBottom: '1px solid var(--border)' }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-end px-3 pb-2 text-[11px]"
                  style={{ width: 'var(--label-w)', background: 'var(--panel-solid)', color: 'var(--fg-muted)' }}
                >
                  {rows.length} 部
                </div>
                <div className="relative" style={{ width: days.length * dayW }}>
                  <div className="relative h-6">
                    {days.map((d, i) =>
                      i === 0 || d.endsWith('-01') ? (
                        <span
                          key={d}
                          className="absolute top-1 pl-1.5 text-[11px] font-medium whitespace-nowrap"
                          style={{ left: i * dayW, borderLeft: i ? '1px solid var(--border)' : 'none' }}
                        >
                          {d.slice(0, 4)}年{Number(d.slice(5, 7))}月
                        </span>
                      ) : null,
                    )}
                  </div>
                  <div className="relative h-5 overflow-hidden">
                    {days.map((d, i) => {
                      const monday = parseDay(d).getDay() === 1
                      if (i !== 0 && !monday) return null
                      const thisWeek = isoWeek(d) === isoWeek(today) && Math.abs(diffDays(d, today)) < 7
                      return (
                        <span
                          key={d}
                          className="absolute inset-y-0 flex items-center pl-1.5 text-[10px] whitespace-nowrap"
                          style={{
                            left: i * dayW,
                            borderLeft: monday ? `1px solid ${WEEK_LINE}` : 'none',
                            color: thisWeek ? 'var(--accent)' : 'var(--fg-muted)',
                            fontWeight: thisWeek ? 600 : undefined,
                          }}
                        >
                          第{isoWeek(d)}周
                          {dayW >= 30 ? <span className="ml-1 opacity-60">{shortDate(d)}</span> : null}
                        </span>
                      )
                    })}
                  </div>
                  <div className="flex h-10">
                    {days.map((d) => {
                      const isToday = d === today
                      const isFocus = d === focus
                      const wd = parseDay(d).getDay()
                      const weekend = wd === 0 || wd === 6
                      const showNum = dayW >= 30 || wd === 1
                      return (
                        <button
                          key={d}
                          onClick={() => setFocus(d)}
                          title={`${d} 周${weekdayOf(d)} · 第${isoWeek(d)}周`}
                          className="flex shrink-0 flex-col items-center justify-center gap-0.5 tabular-nums"
                          style={{
                            width: dayW,
                            background: isOddDay(d) ? ZEBRA : undefined,
                            borderLeft: wd === 1 ? `1px solid ${WEEK_LINE}` : undefined,
                          }}
                        >
                          <span
                            className={`rounded-full text-[11px] leading-[18px] ${dayW >= 30 ? 'min-w-5 px-1' : ''}`}
                            style={{
                              background: isToday ? 'var(--accent)' : isFocus ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : undefined,
                              color: isToday ? '#fff' : 'var(--fg)',
                              fontWeight: isToday || isFocus ? 600 : undefined,
                              visibility: showNum ? undefined : 'hidden',
                            }}
                          >
                            {parseDay(d).getDate()}
                          </span>
                          <span
                            className="text-[10px] leading-none"
                            style={{
                              color: weekend || isToday ? 'var(--accent)' : 'var(--fg-muted)',
                              fontWeight: isToday ? 700 : undefined,
                            }}
                          >
                            {weekdayOf(d)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* 背景列：单双日条纹、周分隔线、选中的那天、今天 */}
              <div
                className="pointer-events-none absolute bottom-0"
                style={{ left: 'var(--label-w)', top: 0, width: days.length * dayW }}
              >
                {days.map((d, i) => {
                  const monday = parseDay(d).getDay() === 1
                  const bg = d === focus ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : isOddDay(d) ? ZEBRA : null
                  return bg || monday ? (
                    <div
                      key={d}
                      className="absolute inset-y-0"
                      style={{
                        left: i * dayW,
                        width: dayW,
                        background: bg ?? undefined,
                        borderLeft: monday ? `1px solid ${WEEK_LINE}` : undefined,
                      }}
                    />
                  ) : null
                })}
                <div
                  className="absolute inset-y-0 w-0.5"
                  style={{ left: dayIdx(today) * dayW + dayW / 2 - 1, background: 'var(--accent)', opacity: 0.7 }}
                />
              </div>

              <div ref={rowsRef}>
              {rows.map((row) => {
                const sid = row.item.id
                const open = trayOpen[sid] ?? (!row.live && row.tray.length > 0)
                const hoverIdx = hover?.sid === sid ? hover.idx : null
                const canDropHere = picked?.sid === sid
                return (
                  <div key={sid} style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex" style={{ height: ROW_H }}>
                      <RowLabel
                        row={row}
                        open={open}
                        onToggleTray={() => setTrayOpen((o) => ({ ...o, [sid]: !open }))}
                        onRemove={() => togglePick(row.item)}
                      />
                      <div
                        data-drop-zone
                        className="relative"
                        style={{
                          width: days.length * dayW,
                          cursor: canDropHere ? 'copy' : 'pointer',
                          background: canDropHere ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : undefined,
                        }}
                        onDragOver={(e) => {
                          if (dragRef.current?.sid !== sid) return
                          e.preventDefault()
                          const x = e.clientX - e.currentTarget.getBoundingClientRect().left
                          const idx = Math.max(0, Math.min(days.length - 1, Math.floor(x / dayW)))
                          if (hover?.sid !== sid || hover.idx !== idx) setHover({ sid, idx })
                        }}
                        onDragLeave={() => setHover(null)}
                        onDrop={(e) => {
                          e.preventDefault()
                          const d = dragRef.current
                          setHover(null)
                          if (!d || d.sid !== sid) return
                          const x = e.clientX - e.currentTarget.getBoundingClientRect().left
                          const idx = Math.max(0, Math.min(days.length - 1, Math.floor(x / dayW)))
                          place(sid, d.ids, days[idx])
                          setPicked(null)
                        }}
                        onClick={(e) => {
                          const x = e.clientX - e.currentTarget.getBoundingClientRect().left
                          const day = days[Math.max(0, Math.min(days.length - 1, Math.floor(x / dayW)))]
                          if (picked?.sid === sid) {
                            place(sid, picked.ids, day)
                            setPicked(null)
                          } else {
                            setFocus(day)
                          }
                        }}
                      >
                        {hoverIdx !== null ? (
                          <div
                            className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-md"
                            style={{ left: hoverIdx * dayW + 1, width: dayW - 2, border: '2px dashed var(--accent)' }}
                          />
                        ) : null}
                        {[...row.dates.entries()].map(([d, list]) => {
                          const idx = dayIdx(d)
                          if (idx < 0 || idx >= days.length) return null
                          const onAir = row.live && list.every((e) => e.airdate === d)
                          const allWatched = list.every((e) => row.watched.has(e.id))
                          const isPicked = picked?.sid === sid && list.every((e) => picked.ids.includes(e.id))
                          const ids = list.map((e) => e.id)
                          return (
                            <button
                              key={d}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', ids.join(','))
                                e.dataTransfer.effectAllowed = 'move'
                                const manual = ids.some((id) => plan.schedule[id] !== undefined)
                                dragRef.current = { sid, ids, manual }
                                // 拖拽开始的同一帧改 DOM，Chrome 有时会直接取消拖拽，推迟一拍
                                if (manual) setTimeout(() => setDraggingManual(true), 0)
                              }}
                              onDragEnd={endDrag}
                              onClick={(e) => {
                                e.stopPropagation()
                                setFocus(d)
                                setPicked(isPicked ? null : { sid, ids })
                              }}
                              title={`${row.item.name} ${epLabel(list)}\n${d} 周${weekdayOf(d)}${onAir ? ' · 首播' : ''}${allWatched ? ' · 已看' : ''}\n${list.map((e) => e.name).filter(Boolean).join(' / ')}`}
                              className="absolute top-2 bottom-2 flex items-center justify-center overflow-hidden rounded-md text-[11px] font-semibold whitespace-nowrap text-white tabular-nums"
                              style={{
                                left: idx * dayW + 2,
                                width: dayW - 4,
                                background: onAir ? 'var(--accent)' : MANUAL,
                                opacity: allWatched ? 0.38 : 1,
                                outline: isPicked ? '2px solid var(--fg)' : 'none',
                                outlineOffset: 1,
                                cursor: 'grab',
                              }}
                            >
                              {dayW >= 24 ? (allWatched && dayW >= 56 ? '✓' : '') + rangeLabel(list, dayW < 56) : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {open ? (
                      <Tray
                        row={row}
                        width={viewW}
                        focus={focus}
                        today={today}
                        picked={picked}
                        onPick={(ids) =>
                          setPicked((p) =>
                            p?.sid === sid && p.ids.length === ids.length && ids.every((id) => p.ids.includes(id))
                              ? null
                              : { sid, ids },
                          )
                        }
                        onDragStart={(ids) => (dragRef.current = { sid, ids, manual: false })}
                        onDragEnd={endDrag}
                        onDropBack={() => {
                          const d = dragRef.current
                          if (d?.sid === sid) unschedule(d.ids)
                        }}
                        onAuto={(n) => autoSchedule(row, n)}
                        onClear={() => clearRow(row)}
                      />
                    ) : null}
                  </div>
                )
              })}

              {!rows.length ? (
                <div
                  className="sticky left-0 px-4 py-12 text-center text-sm"
                  style={{ width: viewW || '100%', color: 'var(--fg-muted)' }}
                >
                  {loadingCollections || eps.progress
                    ? '正在读取放送日期…'
                    : '在看／想看里暂时没有在播的番，去左边勾几部完结的来排吧'}
                </div>
              ) : null}
              </div>

              {/* 空白处照样画时间线，左边标成未使用；这里不是投放区，拖自己排的集块到这儿松手即删除 */}
              {Array.from({ length: Math.floor(spare / ROW_H) }, (_, n) => (
                <div
                  key={n}
                  className="flex"
                  style={{ height: ROW_H, borderBottom: '1px solid var(--border)' }}
                  onClick={(e) => {
                    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - e.currentTarget.firstElementChild!.getBoundingClientRect().width
                    if (x >= 0) setFocus(days[Math.max(0, Math.min(days.length - 1, Math.floor(x / dayW)))])
                  }}
                >
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center px-3 text-[11px]"
                    style={{
                      width: 'var(--label-w)',
                      background: 'var(--panel-solid)',
                      borderRight: '1px solid var(--border)',
                      color: 'color-mix(in srgb, var(--fg-muted) 60%, transparent)',
                    }}
                  >
                    未使用
                  </div>
                  <div style={{ width: days.length * dayW }} />
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* 右栏：选中那天起的看番计划 */}
        <aside className="no-scrollbar order-1 min-w-0 md:col-start-2 md:row-start-1 md:border-b md:p-3 border-[color:var(--border)] 2xl:col-start-3 2xl:overflow-y-auto 2xl:border-b-0 2xl:border-l">
          <div className="mb-2 flex items-center gap-1.5">
            <h2 className="text-sm font-semibold">看番计划</h2>
            <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {focus === today ? '今天和之后三天' : `${shortDate(focus)} 起四天`}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {focus !== today ? (
                <button onClick={() => setFocus(today)} className="rounded px-1.5 text-[11px] hover:opacity-70" style={{ color: 'var(--accent)' }}>
                  回到今天
                </button>
              ) : null}
              <button onClick={() => setFocus(addDays(focus, -1))} className="rounded px-1.5 text-sm hover:opacity-70" title="前一天">
                ‹
              </button>
              <button onClick={() => setFocus(addDays(focus, 1))} className="rounded px-1.5 text-sm hover:opacity-70" title="后一天">
                ›
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-1">
            {planDays.map(({ day, entries }) => (
              <DayCard key={day} day={day} today={today} focus={focus} entries={entries} onSelect={() => setFocus(day)} />
            ))}
          </div>
        </aside>
      </div>

      {/* 点选模式的提示条 */}
      {picked && pickedRow ? (
        <div
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 text-xs"
          style={{ background: 'var(--panel-solid)', boxShadow: 'var(--shadow)', border: '1px solid var(--border)' }}
        >
          <span>
            已选 <b>{pickedRow.item.name}</b> {epLabel(pickedEps)} · 点这一行的某天放下
          </span>
          {pickedEps.some((e) => plan.schedule[e.id]) ? (
            <button
              onClick={() => {
                unschedule(picked.ids)
                setPicked(null)
              }}
              className="rounded-lg px-2 py-1"
              style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)' }}
            >
              {pickedRow.live ? '恢复到首播日' : '移回待排'}
            </button>
          ) : null}
          <button
            onClick={() => setPicked(null)}
            className="rounded-lg px-2 py-1"
            style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)' }}
          >
            取消
          </button>
        </div>
      ) : null}

      {draggingManual ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-2xl px-4 py-2.5 text-xs"
          style={{ background: 'var(--panel-solid)', boxShadow: 'var(--shadow)', border: '1px dashed var(--accent)' }}
        >
          拖到空白处松手即可删除这条排期
        </div>
      ) : null}

      {toast ? (
        <div
          className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-xl px-4 py-2 text-xs text-white"
          style={{ background: 'rgba(15,23,42,0.9)', boxShadow: 'var(--shadow)' }}
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function Cover({ url, w }: { url: string | null; w: number }) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded"
      style={{ width: w, height: Math.round(w * 1.4), background: 'color-mix(in srgb, var(--fg) 8%, transparent)' }}
    >
      {url ? (
        <img
          src={coverAt(url, 100) ?? ''}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : null}
    </span>
  )
}

function StatusBadge({ status }: { status: AirStatus }) {
  const live = status === 'airing' || status === 'upcoming'
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] leading-4 font-medium whitespace-nowrap"
      style={{
        background: status === 'airing' ? 'var(--accent)' : live ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'color-mix(in srgb, var(--fg) 8%, transparent)',
        color: status === 'airing' ? '#fff' : live ? 'var(--accent)' : 'var(--fg-muted)',
      }}
    >
      {AIR_STATUS_LABEL[status]}
    </span>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function RowLabel({
  row,
  open,
  onToggleTray,
  onRemove,
}: {
  row: Row
  open: boolean
  onToggleTray: () => void
  onRemove: () => void
}) {
  const { item } = row
  return (
    <div
      className="group/label sticky left-0 z-10 flex shrink-0 items-center gap-2 px-2 sm:px-3"
      style={{ width: 'var(--label-w)', background: 'var(--panel-solid)', borderRight: '1px solid var(--border)' }}
    >
      <span className="hidden sm:block">
        <Cover url={item.cover} w={22} />
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={subjectUrl(item.id)}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate text-xs font-medium hover:underline"
          title={item.name}
        >
          {item.name}
        </a>
        <div className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: 'var(--fg-muted)' }}>
          <StatusBadge status={row.status} />
          <span className="truncate tabular-nums">
            {row.eps.length ? `${Math.min(item.epStatus, row.eps.length)}/${row.eps.length}` : ''}
          </span>
        </div>
      </div>
      {row.tray.length || open ? (
        <button
          onClick={onToggleTray}
          className="shrink-0 rounded px-1 text-[10px] leading-4 whitespace-nowrap"
          style={{
            background: open ? MANUAL : `color-mix(in srgb, ${MANUAL} 15%, transparent)`,
            color: open ? '#fff' : MANUAL,
          }}
          title="还没排日子的集"
        >
          待排 {row.tray.length}
        </button>
      ) : null}
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 hidden rounded px-1 text-[11px] leading-none group-hover/label:block"
        style={{ color: 'var(--fg-muted)' }}
        title="不排这部了"
      >
        ×
      </button>
    </div>
  )
}

function Tray({
  row,
  width,
  focus,
  today,
  picked,
  onPick,
  onDragStart,
  onDragEnd,
  onDropBack,
  onAuto,
  onClear,
}: {
  row: Row
  width: number
  focus: string
  today: string
  picked: Picked | null
  onPick: (ids: number[]) => void
  onDragStart: (ids: number[]) => void
  onDragEnd: () => void
  onDropBack: () => void
  onAuto: (perDay: number) => void
  onClear: () => void
}) {
  const [perDay, setPerDay] = useState(2)
  const [over, setOver] = useState(false)
  const from = focus < today ? today : focus

  return (
    <div
      data-drop-zone
      className="sticky left-0 px-3 py-2"
      style={{
        width: width || '100%',
        background: over
          ? `color-mix(in srgb, ${MANUAL} 12%, var(--panel-solid))`
          : `color-mix(in srgb, ${MANUAL} 5%, var(--panel-solid))`,
        borderTop: '1px dashed var(--border)',
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDropBack()
      }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
        <span>
          {row.tray.length ? `${row.tray.length} 集待排 · 拖到上面那一行的日期上，或点一下再点日期` : '都排好了 · 把集块拖回这里可以取消排期'}
        </span>
        {row.tray.length ? (
          <span className="flex items-center gap-1">
            从 {relativeDayLabel(from, today)} 起每天
            <select
              value={perDay}
              onChange={(e) => setPerDay(Number(e.target.value))}
              className="rounded px-1 py-0.5 text-[11px] outline-none"
              style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
            >
              {[1, 2, 3, 4, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            集
            <button
              onClick={() => onAuto(perDay)}
              className="rounded px-2 py-0.5 text-white"
              style={{ background: MANUAL }}
            >
              自动排
            </button>
          </span>
        ) : null}
        {row.manual ? (
          <button onClick={onClear} className="underline underline-offset-2 hover:opacity-70">
            清空这部的排期
          </button>
        ) : null}
      </div>
      {row.tray.length ? (
        <div className="flex flex-wrap gap-1">
          {row.tray.map((e) => {
            const on = picked?.sid === row.item.id && picked.ids.includes(e.id)
            return (
              <button
                key={e.id}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData('text/plain', String(e.id))
                  ev.dataTransfer.effectAllowed = 'move'
                  onDragStart([e.id])
                }}
                onDragEnd={onDragEnd}
                onClick={() => onPick([e.id])}
                title={`第${e.sort}话${e.name ? ` ${e.name}` : ''}${e.airdate ? `\n首播 ${e.airdate}` : ''}`}
                className="min-w-7 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors"
                style={{
                  background: on ? MANUAL : `color-mix(in srgb, ${MANUAL} 16%, transparent)`,
                  color: on ? '#fff' : MANUAL,
                  cursor: 'grab',
                }}
              >
                {e.sort}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function DayCard({
  day,
  today,
  focus,
  entries,
  onSelect,
}: {
  day: string
  today: string
  focus: string
  entries: { row: Row; eps: Episode[] }[]
  onSelect: () => void
}) {
  const total = entries.reduce((n, e) => n + e.eps.length, 0)
  const isToday = day === today
  return (
    <section
      className="panel rounded-2xl p-3 md:rounded-xl md:bg-transparent md:backdrop-blur-none"
      style={{ outline: day === focus ? '1.5px solid color-mix(in srgb, var(--accent) 60%, transparent)' : 'none' }}
    >
      <button onClick={onSelect} className="mb-2 flex w-full items-baseline gap-1.5 text-left">
        <span className="text-sm font-semibold" style={{ color: isToday ? 'var(--accent)' : undefined }}>
          {relativeDayLabel(day, today)}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
          {shortDate(day)} 周{weekdayOf(day)}
        </span>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: 'var(--fg-muted)' }}>
          {total ? `${total} 集` : ''}
        </span>
      </button>
      {entries.length ? (
        <ul className="space-y-1.5">
          {entries.map(({ row, eps }) => {
            const allWatched = eps.every((e) => row.watched.has(e.id))
            const premiere = row.live && eps.some((e) => e.airdate === day)
            return (
              <li key={row.item.id} className="flex items-center gap-2" style={{ opacity: allWatched ? 0.5 : 1 }}>
                <Cover url={row.item.cover} w={28} />
                <div className="min-w-0 flex-1">
                  <a
                    href={subjectUrl(row.item.id)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate text-xs font-medium hover:underline"
                    title={row.item.name}
                  >
                    {row.item.name}
                  </a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                    <span className="tabular-nums" style={{ textDecoration: allWatched ? 'line-through' : undefined }}>
                      {epLabel(eps)}
                    </span>
                    {row.live ? (
                      <span
                        className="rounded px-1 text-[10px] leading-4 font-medium text-white"
                        style={{ background: 'var(--accent)' }}
                      >
                        {row.status === 'upcoming' ? '新番' : '连载中'}
                      </span>
                    ) : null}
                    {premiere ? (
                      <span className="text-[10px]" style={{ color: 'var(--accent)' }}>
                        当日更新
                      </span>
                    ) : null}
                    {allWatched ? <span className="text-[10px]">已看</span> : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-1 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
          没有安排
        </p>
      )}
    </section>
  )
}
