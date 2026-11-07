'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { subjectUrl, type SourceId, type WallItem } from '@/lib/bangumi'
import { DEFAULT_DISPLAY, type DisplayConfig } from '@/lib/display'
import {
  MAX_TIMES,
  TIME_UNITS,
  formatTime,
  formatValue,
  isCounted,
  subjectStats,
  unitLabel,
  type SubjectStats,
  type TimeUnit,
} from '@/lib/stats'
import { BAR_BTN, BAR_BTN_STYLE, GitHubLink, Chip, ChipGroup, Divider } from './Chip'
import { CoverCard } from './CoverCard'
import { ProgressBar } from './Progress'
import { useBlurb } from './useBlurb'
import { useCollections } from './useCollections'
import { useDurations } from './useDurations'
import { usePersisted } from './usePersisted'

const DEFAULT_PREFS = {
  /** 每集扣掉的 OP/ED，分钟 */
  skipMinutes: 3,
  /** 泡面番每集扣掉的 OP/ED，秒 */
  shortSkipSeconds: 60,
  /** 条目 id → 刷了几遍；没记的就是一刷 */
  rewatch: {} as Record<number, number>,
  /** 是否扣除；关掉就是原始总时长 */
  deduct: true,
  /** 整部番都没有时长数据时，每集按多少分钟算 */
  fallbackMinutes: 24,
  unit: 'hour' as TimeUnit,
}

/** 和封面墙中等尺寸一样的卡片；手机上小标题要放时长和集数，不用更窄的小尺寸 */
const CARD_DISPLAY: DisplayConfig = { ...DEFAULT_DISPLAY, size: 'md' }
const GRID_STYLE = { '--card-min': '150px', '--card-min-sm': '108px' } as React.CSSProperties

function sum(rows: SubjectStats[], key: 'fullSeconds' | 'netSeconds' | 'eps' | 'estimated') {
  return rows.reduce((n, r) => n + r[key], 0)
}

/** 数字输入框：打字中途允许是空的，失焦才归位到当前值 */
function NumberField({
  label,
  value,
  suffix = '分钟',
  step = 0.5,
  max = 180,
  disabled,
  onChange,
}: {
  label: string
  value: number
  suffix?: string
  step?: number
  max?: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  // 存档是挂载后才读出来的，外面的值变了要跟上
  useEffect(() => setText(String(value)), [value])

  return (
    <label className={`flex items-center gap-1.5 text-xs ${disabled ? 'opacity-50' : ''}`} style={{ color: 'var(--fg-muted)' }}>
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step={step}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n) && n >= 0) onChange(Math.min(n, max))
        }}
        onBlur={() => setText(String(value))}
        className="w-14 rounded-lg px-2 py-1 text-xs tabular-nums outline-none"
        style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' }}
      />
      {suffix}
    </label>
  )
}

/**
 * 刷了几遍，可以填任意次数。列表按时长排序，每打一个字就生效的话卡片会在打字途中跳走，
 * 所以等回车或失焦才算数。
 */
function TimesField({ name, value, onChange }: { name: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const commit = () => {
    const n = Math.floor(Number(text))
    if (text.trim() !== '' && Number.isFinite(n) && n >= 1) {
      const times = Math.min(n, MAX_TIMES)
      setText(String(times))
      onChange(times)
    } else {
      setText(String(value))
    }
  }

  return (
    <label
      className="mt-auto flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: value > 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--fg) 8%, transparent)',
        color: value > 1 ? '#fff' : 'var(--fg)',
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${name} 刷了几遍`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-7 bg-transparent text-center tabular-nums outline-none"
      />
      刷
    </label>
  )
}

const TILES = [
  { status: 2, label: '看过' },
  { status: 3, label: '在看' },
  { status: 4, label: '搁置' },
  { status: 5, label: '抛弃' },
]

const FETCH_ORDER: Record<number, number> = { 3: 0, 2: 1, 4: 2, 5: 3 }

function Tile({ label, seconds, eps, count, unit }: { label: string; seconds: number; eps: number; count: number; unit: TimeUnit }) {
  return (
    <div className="panel min-w-0 rounded-2xl px-4 py-3">
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
        {label} · {count} 部
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{formatTime(seconds, unit)}</p>
      <p className="text-xs tabular-nums" style={{ color: 'var(--fg-muted)' }}>
        {eps.toLocaleString('zh-CN')} 集
      </p>
    </div>
  )
}

export function Stats({ username, source, aiEnabled }: { username: string; source: SourceId; aiEnabled: boolean }) {
  const collections = useCollections(username, source)
  // 几刷是跟人走的，按用户名分开存
  const [prefs, setPrefs] = usePersisted(`bw_stats:${username}`, DEFAULT_PREFS)

  const counted = useMemo(
    // 没看过的除外，一格没点的时长是 0，不用取
    () => (collections.items ?? []).filter((i) => isCounted(i) && (i.status === 2 || i.epStatus > 0)),
    [collections.items],
  )
  const ids = useMemo(
    // 在看的先取，搁置、抛弃的最后
    () => [...counted].sort((a, b) => FETCH_ORDER[a.status] - FETCH_ORDER[b.status] || a.id - b.id).map((i) => i.id),
    [counted],
  )
  const { durations, progress, error } = useDurations(ids, source)

  const { rows, missing } = useMemo(() => {
    const opts = {
      skipSeconds: prefs.skipMinutes * 60,
      shortSkipSeconds: prefs.shortSkipSeconds,
      fallbackSeconds: prefs.fallbackMinutes * 60,
    }
    const rows: SubjectStats[] = []
    const missing: WallItem[] = []
    for (const item of counted) {
      const d = durations[item.id]
      if (!d) {
        if (!progress) missing.push(item) // 还在取的不算缺
        continue
      }
      const s = subjectStats(item, d, opts, prefs.rewatch[item.id] ?? 1)
      if (s.eps > 0) rows.push(s)
      else missing.push(item)
    }
    // 按当前显示的口径排，否则扣除后的数字看起来是乱序的
    rows.sort((a, b) => (prefs.deduct ? b.netSeconds - a.netSeconds : b.fullSeconds - a.fullSeconds))
    return { rows, missing }
  }, [counted, durations, progress, prefs.skipMinutes, prefs.shortSkipSeconds, prefs.fallbackMinutes, prefs.rewatch, prefs.deduct])

  const unit = prefs.unit
  const timeKey = prefs.deduct ? 'netSeconds' : 'fullSeconds'
  const groups = TILES.map((t) => ({ ...t, rows: rows.filter((r) => r.item.status === t.status) }))
  const estimated = sum(rows, 'estimated')
  // 等数字加载完再取，免得中途的总数也去生成一遍
  const blurb = useBlurb(sum(rows, timeKey) / 3600, aiEnabled && !collections.loading && !progress)
  const backdrop = rows.find((r) => r.item.cover)?.item.cover ?? null
  const ratio = collections.progress && collections.progress.total > 0
    ? collections.progress.loaded / collections.progress.total
    : null

  return (
    <>
      {backdrop ? <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} /> : null}

      <div className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
        <header className="flex flex-wrap items-center gap-3 py-4 sm:py-6">
          <h1 className="text-xl font-semibold sm:text-2xl">看番时长</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className={BAR_BTN} style={BAR_BTN_STYLE}>
              ← 封面墙
            </Link>
            <Link href="/grid" className={BAR_BTN} style={BAR_BTN_STYLE}>
              喜好表
            </Link>
            <Link href="/plan" className={BAR_BTN} style={BAR_BTN_STYLE}>
              时间线
            </Link>
            <GitHubLink />
          </div>
        </header>

        {collections.error || error ? (
          <div className="panel mb-4 rounded-xl p-3 text-sm text-red-500">{collections.error || error}</div>
        ) : null}

        {collections.loading ? (
          <ProgressBar
            value={ratio}
            label={
              collections.progress
                ? `正在获取收藏 ${collections.progress.loaded}/${collections.progress.total}`
                : '正在获取收藏…'
            }
          />
        ) : progress ? (
          <ProgressBar
            value={progress.loaded / progress.total}
            label={`正在获取分集时长 ${progress.loaded}/${progress.total}，数字会继续变大`}
          />
        ) : null}

        <section className="panel mb-3 rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <p className="font-semibold tabular-nums">
              <span className="text-4xl sm:text-6xl">{formatValue(sum(rows, timeKey), unit)}</span>
              <span className="ml-2 text-base sm:text-xl" style={{ color: 'var(--fg-muted)' }}>
                {unitLabel(unit)}
              </span>
            </p>
            <p className="font-semibold tabular-nums">
              <span className="text-2xl sm:text-4xl">{sum(rows, 'eps').toLocaleString('zh-CN')}</span>
              <span className="ml-2 text-base sm:text-xl" style={{ color: 'var(--fg-muted)' }}>
                集
              </span>
            </p>
          </div>
          <p className="mt-3 text-xs sm:text-sm" style={{ color: 'var(--fg-muted)' }}>
            {prefs.deduct
              ? `每集扣除 ${prefs.skipMinutes} 分钟 OP/ED，泡面番扣 ${prefs.shortSkipSeconds} 秒；不扣除共 ${formatTime(sum(rows, 'fullSeconds'), unit)}`
              : `未扣除 OP/ED；扣除后共 ${formatTime(sum(rows, 'netSeconds'), unit)}`}
            {rows.some((r) => r.times > 1) ? '。已计入二刷及以上' : ''}
          </p>
          {blurb ? (
            <p className="mt-3 text-sm sm:text-base">
              {blurb}
              <span className="ml-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
                AI 生成
              </span>
            </p>
          ) : null}
        </section>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {groups.map((g) => (
            <Tile key={g.status} label={g.label} seconds={sum(g.rows, timeKey)} eps={sum(g.rows, 'eps')} count={g.rows.length} unit={unit} />
          ))}
        </div>

        <div className="panel mb-3 flex flex-wrap items-center gap-x-2 gap-y-2.5 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
          <ChipGroup label="单位">
            {TIME_UNITS.map((u) => (
              <Chip key={u.id} active={unit === u.id} onClick={() => setPrefs((p) => ({ ...p, unit: u.id }))}>
                {u.label}
              </Chip>
            ))}
          </ChipGroup>
          <Divider />
          <ChipGroup label="OP/ED">
            <Chip active={prefs.deduct} onClick={() => setPrefs((p) => ({ ...p, deduct: true }))}>
              扣除
            </Chip>
            <Chip active={!prefs.deduct} onClick={() => setPrefs((p) => ({ ...p, deduct: false }))}>
              不扣除
            </Chip>
          </ChipGroup>
          <NumberField
            label="每集扣"
            value={prefs.skipMinutes}
            disabled={!prefs.deduct}
            onChange={(v) => setPrefs((p) => ({ ...p, skipMinutes: v }))}
          />
          <NumberField
            label="泡面番每集扣"
            value={prefs.shortSkipSeconds}
            suffix="秒"
            step={5}
            max={600}
            disabled={!prefs.deduct}
            onChange={(v) => setPrefs((p) => ({ ...p, shortSkipSeconds: v }))}
          />
          <Divider />
          <NumberField
            label="没有时长的番每集按"
            value={prefs.fallbackMinutes}
            onChange={(v) => setPrefs((p) => ({ ...p, fallbackMinutes: v }))}
          />
        </div>

        <div className="mb-4 space-y-1 px-1 text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
          <p>统计动画里的「看过」「在看」「搁置」「抛弃」，后三种算到已点的格子。不足 10 分钟的集算泡面番。在封面下方可以填每部番刷了几遍。月按 30 天、年按 365 天换算。</p>
          <p>
            如果显示不准，请到
            <Link href="/" className="underline">
              主页
            </Link>
            再获取一次数据。
          </p>
          {estimated > 0 ? <p>其中 {estimated.toLocaleString('zh-CN')} 集 Bangumi 上没有时长，是估算的，这些番的时长前带 ≈。</p> : null}
          {missing.length > 0 ? (
            <details>
              <summary className="cursor-pointer">{missing.length} 部没有取到分集，未计入</summary>
              <p className="mt-1">
                {missing.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 ? '、' : ''}
                    <a href={subjectUrl(m.id)} target="_blank" rel="noreferrer noopener" className="underline">
                      {m.name}
                    </a>
                  </span>
                ))}
              </p>
            </details>
          ) : null}
        </div>

        {rows.length === 0 && collections.items && !progress ? (
          <div className="panel rounded-xl p-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
            还没有看过的动画
          </div>
        ) : (
          <div className="wall-grid stats-grid" style={GRID_STYLE}>
            {rows.map((r) => (
              <div key={r.item.id} className="flex flex-col items-center">
              <div className="mb-1.5 w-full">
                <CoverCard
                  item={r.item}
                  display={CARD_DISPLAY}
                  showTypeIcon={false}
                  // 单部番用年、月太小，这些单位下卡片仍显示小时
                  subtitle={`${r.estimated > 0 ? '≈' : ''}${formatTime(r[timeKey], unit === 'minute' ? 'minute' : 'hour')} · ${
                    r.times > 1 ? `${r.eps / r.times}集×${r.times}` : `${r.eps}集`
                  }`}
                />
              </div>
              <TimesField
                name={r.item.name}
                value={r.times}
                onChange={(times) =>
                  setPrefs((p) => {
                    const rewatch = { ...p.rewatch }
                    if (times > 1) rewatch[r.item.id] = times
                    else delete rewatch[r.item.id]
                    return { ...p, rewatch }
                  })
                }
              />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
