/** 超过这个小时数都按这个算，也是文案缓存键的上限 */
const MAX_HOURS = 100000

/**
 * 把总时长归到一个档位，文案按档位生成和缓存。档位总共不到 200 个，
 * 所以不管多少人用、接口被怎么刷，要调模型的次数都有上限。
 * 不足 1 小时返回 0，表示不生成。
 */
export function blurbBucket(hours: number): number {
  if (!(hours >= 1)) return 0
  const h = Math.min(hours, MAX_HOURS)
  const step = Math.max(1, 10 ** Math.floor(Math.log10(h)) / 5)
  return Math.round(h / step) * step
}

/** 发给 AI 的统计，都是档位，同一档的人共用一条文案 */
export interface BlurbInput {
  hours: number
  /** 计入的番剧部数 */
  shows: number
  /** 其中抛弃的部数，可以是 0 */
  dropped: number
}

export function blurbInput(hours: number, shows: number, dropped: number): BlurbInput | null {
  const h = blurbBucket(hours)
  const s = blurbBucket(shows)
  if (!h || !s) return null
  return { hours: h, shows: s, dropped: Math.min(blurbBucket(dropped), s) }
}

export function blurbKey({ hours, shows, dropped }: BlurbInput) {
  return `${hours}-${shows}-${dropped}`
}
