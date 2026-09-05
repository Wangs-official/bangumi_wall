import type { WallItem } from './bangumi'

/**
 * 判断哪些条目属于同一个系列，用于「同系列相邻」排序。两条证据来源：
 * 1. 标题归一化 —— 免费、即时，但只抓得到「第N季 / Season N」这类显式标记
 * 2. Bangumi 条目关联（续集/前传）—— 准确，能抓到「Code Geass ⇄ R2」这种，
 *    但每个条目一次请求，只能分块慢慢建
 * 两者用并查集取并集，所以关系可以传递。
 */

const CN = '一二三四五六七八九十百零〇两'

/** 只削「季」标记，不动分隔符 —— 「蜘蛛侠：纵横宇宙」和「蜘蛛侠：平行宇宙」不能因为冒号就并到一起 */
const SEASON_PATTERNS = [
  new RegExp(`第[${CN}\\d]+[季期]$`),
  new RegExp(`[${CN}\\d]+期$`),
  /season\s*\d+$/i,
  /\d+(st|nd|rd|th)\s+season$/i,
  /\bs\d+$/i,
  /[Ⅰ-Ⅹ]$/,
  /(?<=[一-鿿])\s*(II|III|IV|V|VI)$/,
]

/** 削完季标记后残留的尾部标点 */
const TRAILING_PUNCT = /[\s　·・:：\-—~〜]+$/

export function seriesBaseName(name: string): string {
  let n = name.trim()
  let prev = ''
  while (prev !== n) {
    prev = n
    for (const p of SEASON_PATTERNS) n = n.replace(p, '').trim()
    n = n.replace(TRAILING_PUNCT, '').trim()
  }
  return n || name
}

/** 收藏里两个条目之间的系列关系边 */
export type SeriesEdge = [number, number]

class UnionFind {
  private parent = new Map<number, number>()

  find(x: number): number {
    const p = this.parent.get(x)
    if (p === undefined) {
      this.parent.set(x, x)
      return x
    }
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }

  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

export interface ClusterOptions {
  /** 是否启用标题归一化这条证据 */
  byName?: boolean
  edges?: SeriesEdge[]
}

/**
 * 把条目切成若干个系列簇。单独一部的自成一簇。
 * 簇内按日期升序 —— 同系列相邻时，第一季排在第二季前面。
 */
export function buildClusters(items: WallItem[], opts: ClusterOptions = {}): WallItem[][] {
  const { byName = true, edges = [] } = opts
  const uf = new UnionFind()
  const byId = new Map(items.map((i) => [i.id, i]))

  if (byName) {
    const buckets = new Map<string, number[]>()
    for (const it of items) {
      // 同类别内才归并：同名的游戏和动画不是一回事
      const k = `${it.subjectType} ${seriesBaseName(it.name)}`
      const arr = buckets.get(k)
      if (arr) arr.push(it.id)
      else buckets.set(k, [it.id])
    }
    for (const ids of buckets.values()) {
      for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i])
    }
  }

  for (const [a, b] of edges) {
    const ia = byId.get(a)
    const ib = byId.get(b)
    if (ia && ib && ia.subjectType === ib.subjectType) uf.union(a, b)
  }

  const clusters = new Map<number, WallItem[]>()
  for (const it of items) {
    const root = uf.find(it.id)
    const arr = clusters.get(root)
    if (arr) arr.push(it)
    else clusters.set(root, [it])
  }

  return [...clusters.values()].map((group) =>
    [...group].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
  )
}
