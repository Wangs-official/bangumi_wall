import type { WallItem } from './bangumi'

/** 不足这个时长的集算泡面番，OP/ED 短，单独按 shortSkipSeconds 扣 */
const SHORT_EP_SECONDS = 10 * 60

/** 一部番最多记几刷 */
export const MAX_TIMES = 999

export interface StatsOptions {
  /** 每集扣掉的 OP/ED 秒数 */
  skipSeconds: number
  /** 泡面番每集扣掉的秒数 */
  shortSkipSeconds: number
  /** 这部番一集时长都没有时，每集按多少秒算 */
  fallbackSeconds: number
}

export interface SubjectStats {
  item: WallItem
  /** 刷了几遍 */
  times: number
  /** 计入的集数，含重刷 */
  eps: number
  /** 不扣 OP/ED 的总秒数 */
  fullSeconds: number
  /** 扣掉 OP/ED 后的总秒数 */
  netSeconds: number
  /** 其中有几集没有时长数据、是估算的 */
  estimated: number
}

/** 条目详情里的「片长」。剧场版写的是全片时长，其他类型写的通常是每集时长 */
export interface Runtime {
  seconds: number
  movie: boolean
}

/** 片长是用户填的，写法很杂：106分钟、120分、60min、约63分钟、1小时46分、01:46:00 */
export function parseRuntime(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const clock = value.match(/(\d+):(\d{2}):(\d{2})/)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) || null
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:小时|小時|時間|时间|hours?|hr|h)/i)
  const minutes = value.match(/(\d+)\s*(?:分|min|m)/i)
  if (hours || minutes) return Math.round(Number(hours?.[1] ?? 0) * 3600 + Number(minutes?.[1] ?? 0) * 60) || null
  // 只写了一个数字的，按分钟算
  const bare = value.match(/^\D*(\d+)\D*$/)
  return bare ? Number(bare[1]) * 60 || null : null
}

export function runtimeOfSubject(subject: { platform?: string; infobox?: { key: string; value: unknown }[] }): Runtime | null {
  const field = subject.infobox?.find((x) => /^(单集)?(片长|时长)$/.test(x.key))
  const seconds = parseRuntime(field?.value)
  return seconds ? { seconds, movie: subject.platform === '剧场版' } : null
}

/**
 * 分集一个时长都没有时，用片长补上。剧场版把全片时长平摊到各集；
 * 没有分集列表的剧场版当作 1 集。分集有数据的不动，缺的那几集还是按中位数估算。
 */
export function fillFromRuntime(durations: number[], runtime: Runtime | null | undefined): number[] {
  if (!runtime || durations.some((d) => d > 0)) return durations
  if (!runtime.movie) return durations.map(() => runtime.seconds)
  if (!durations.length) return [runtime.seconds]
  return durations.map(() => Math.round(runtime.seconds / durations.length))
}

/** 统计看过、在看、搁置、抛弃的动画，想看的不算 */
export function isCounted(i: WallItem) {
  return i.subjectType === 2 && i.status >= 2 && i.status <= 5
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * 算一部番看了多久。durations 是已播出的正片时长（秒），按集数顺序，0 表示没有数据。
 *
 * 看过的算全部集，在看、搁置、抛弃的算到已点的格子。收藏里只有「看到第几集」一个数，
 * 所以和时间线一样按顺序数前 n 集。缺时长的集优先按同一部番其他集的中位数估算。
 * times 是刷的遍数，结果整体乘上去。
 */
export function subjectStats(item: WallItem, durations: number[], opts: StatsOptions, times = 1): SubjectStats {
  const watched = item.status === 2 ? durations : durations.slice(0, item.epStatus)
  const known = durations.filter((d) => d > 0)
  const guess = known.length ? median(known) : opts.fallbackSeconds

  let fullSeconds = 0
  let netSeconds = 0
  let estimated = 0
  for (const raw of watched) {
    if (raw <= 0) estimated++
    const d = raw > 0 ? raw : guess
    fullSeconds += d
    netSeconds += Math.max(0, d - (d < SHORT_EP_SECONDS ? opts.shortSkipSeconds : opts.skipSeconds))
  }
  return {
    item,
    times,
    eps: watched.length * times,
    fullSeconds: fullSeconds * times,
    netSeconds: netSeconds * times,
    estimated: estimated * times,
  }
}

export const TIME_UNITS = [
  { id: 'minute', label: '分钟', seconds: 60, digits: 0 },
  { id: 'hour', label: '小时', seconds: 3600, digits: 1 },
  { id: 'day', label: '天', seconds: 86400, digits: 1 },
  { id: 'week', label: '周', seconds: 7 * 86400, digits: 1 },
  { id: 'month', label: '月', seconds: 30 * 86400, digits: 1 },
  { id: 'year', label: '年', seconds: 365 * 86400, digits: 2 },
] as const

export type TimeUnit = (typeof TIME_UNITS)[number]['id']

/** 换算成某个单位的数字，不带单位名 */
export function formatValue(seconds: number, unit: TimeUnit) {
  const u = TIME_UNITS.find((t) => t.id === unit) ?? TIME_UNITS[1]
  return (seconds / u.seconds).toLocaleString('zh-CN', {
    minimumFractionDigits: u.digits,
    maximumFractionDigits: u.digits,
  })
}

export function unitLabel(unit: TimeUnit) {
  return (TIME_UNITS.find((t) => t.id === unit) ?? TIME_UNITS[1]).label
}

export function formatTime(seconds: number, unit: TimeUnit) {
  return `${formatValue(seconds, unit)} ${unitLabel(unit)}`
}
