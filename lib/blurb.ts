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
