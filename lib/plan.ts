import type { WallItem } from './bangumi'

/** 一集。只留时间线用得到的字段，desc 之类的大段文字不进缓存。 */
export interface Episode {
  id: number
  /** 在条目里的集数（续作可能从 13 开始） */
  sort: number
  name: string
  /** YYYY-MM-DD；没公布就是 null */
  airdate: string | null
}

/**
 * 条目的放送状态，由剧集的放送日期推出来：
 * - airing：已开播，还有没播的集
 * - upcoming：一集都还没播
 * - ended：全部播完（或者干脆没有剧集数据）
 * - unknown：剧集还没取回来
 */
export type AirStatus = 'airing' | 'upcoming' | 'ended' | 'unknown'

export const AIR_STATUS_LABEL: Record<AirStatus, string> = {
  airing: '连载中',
  upcoming: '未开播',
  ended: '已完结',
  unknown: '…',
}

// ---- 日期：一律用本地日期的 YYYY-MM-DD 字符串，字符串比较即时间先后 ----

export function fmtDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr(): string {
  return fmtDay(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return fmtDay(d)
}

/** b - a，单位天。走 UTC 避开夏令时那一小时 */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayOf(s: string): string {
  return WEEKDAY[parseDay(s).getDay()]
}

/** 今年第几周（ISO 8601：周一开头，含当年第一个周四的那周是第 1 周） */
export function isoWeek(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  // 挪到本周的周四，周四落在哪一年，这周就算哪一年
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7))
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1)
  return Math.floor((t.getTime() - jan1) / 86400000 / 7) + 1
}

/** 按日期的奇偶交替铺底色。用绝对日期算，时间线范围变了条纹也不会跳 */
export function isOddDay(s: string): boolean {
  return diffDays('2000-01-01', s) % 2 === 1
}

/** 「今天 / 明天 / 后天 / 9月29日」 */
export function relativeDayLabel(day: string, today: string): string {
  const n = diffDays(today, day)
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n === 2) return '后天'
  if (n === -1) return '昨天'
  const d = parseDay(day)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** Bangumi 的 airdate 偶尔是空串或 "0000-00-00"，统一成 null */
export function normalizeAirdate(s: unknown): string | null {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith('0000') ? s : null
}

export function airStatus(eps: Episode[] | undefined, today: string): AirStatus {
  if (!eps) return 'unknown'
  const dated = eps.map((e) => e.airdate).filter((d): d is string => d !== null)
  if (!dated.length) return 'ended'
  const first = dated.reduce((a, b) => (a < b ? a : b))
  const last = dated.reduce((a, b) => (a > b ? a : b))
  if (first > today) return 'upcoming'
  if (last >= today) return 'airing'
  // 后面的集已经列出来但还没定档，而上一集刚播不久 —— 多半还在连载
  if (dated.length < eps.length && diffDays(last, today) <= 14) return 'airing'
  return 'ended'
}

/**
 * 看过的集。收藏里只有「看到第几集」这一个数，按集数顺序数前 n 集。
 * 续作的 sort 可能从 13 开始，所以数位置而不是比 sort。
 */
export function watchedSet(eps: Episode[], epStatus: number): Set<number> {
  return new Set(
    [...eps]
      .sort((a, b) => a.sort - b.sort)
      .slice(0, epStatus)
      .map((e) => e.id),
  )
}

// ---- 用户的排期，存在 localStorage ----

export interface PlanState {
  v: 1
  /** 用户手动勾选／取消的条目；没出现的按默认规则算 */
  picks: Record<number, boolean>
  /** 集 id → 安排在哪天看 */
  schedule: Record<number, string>
}

const PLAN_KEY = (u: string) => `bw_plan:${u}`

export function loadPlan(username: string): PlanState {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_KEY(username)) ?? 'null')
    if (raw?.v === 1) return { v: 1, picks: raw.picks ?? {}, schedule: raw.schedule ?? {} }
  } catch {
    /* 坏数据就当没有 */
  }
  return { v: 1, picks: {}, schedule: {} }
}

export function savePlan(username: string, plan: PlanState) {
  try {
    localStorage.setItem(PLAN_KEY(username), JSON.stringify(plan))
  } catch {
    /* 超配额就算了 */
  }
}

/** 左栏的候选：动画里的想看 / 在看 */
export function isPlanCandidate(i: WallItem) {
  return i.subjectType === 2 && (i.status === 1 || i.status === 3)
}

/**
 * 进页面就预取剧集的条目。想看列表动辄几百部，大多是老番，
 * 一上来全拉太慢 —— 只拉「在看」和近一年多的新番，其余等用户勾上再拉。
 */
export function shouldPrefetch(i: WallItem, today: string) {
  if (!isPlanCandidate(i)) return false
  if (i.status === 3) return true
  return !i.date || diffDays(i.date, today) < 450
}

// ---- 自动排 ----

export type AutoMode = 'daily' | 'alternate' | 'weekly' | 'original'

export const AUTO_MODES: { id: AutoMode; label: string }[] = [
  { id: 'daily', label: '每天' },
  { id: 'alternate', label: '隔一天' },
  { id: 'weekly', label: '每周' },
  { id: 'original', label: '按原作节奏' },
]

const STEP: Record<Exclude<AutoMode, 'original'>, number> = { daily: 1, alternate: 2, weekly: 7 }

/** 原作放送的基准日：待排的集里第一个有放送日期的 */
export function originalBase(eps: Episode[]): string | null {
  return eps.find((e) => e.airdate)?.airdate ?? null
}

/**
 * 给一串待排的集算日子，返回 集 id → 日期。
 *
 * - 每天 / 隔一天 / 每周：从 start 起每个时段排 perSlot 集
 * - 按原作节奏：保持原作两集之间的间隔（停播周也照搬），整体平移到 start。
 *   比如原作每周日更新、start 是周四，就变成每周四一集；perSlot 不起作用
 *
 * 不管哪种，都不会把集排在它的首播日之前。
 */
export function autoPlan(eps: Episode[], start: string, mode: AutoMode, perSlot: number): Record<number, string> {
  const out: Record<number, string> = {}
  if (mode === 'original') {
    const base = originalBase(eps)
    let last: string | null = null
    for (const e of eps) {
      let d: string
      if (base && e.airdate) d = addDays(start, diffDays(base, e.airdate))
      else d = last ? addDays(last, 7) : start // 没有放送日期的按每周接着排
      if (e.airdate && d < e.airdate) d = e.airdate
      out[e.id] = d
      last = d
    }
    return out
  }

  const step = STEP[mode]
  let d = start
  let count = 0
  for (const e of eps) {
    if (count >= perSlot) {
      d = addDays(d, step)
      count = 0
    }
    // 还没播到的集往后顺延，但保持同样的节奏
    while (e.airdate && e.airdate > d) {
      d = addDays(d, step)
      count = 0
    }
    out[e.id] = d
    count++
  }
  return out
}
