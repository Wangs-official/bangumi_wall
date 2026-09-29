import { NextResponse } from 'next/server'
import { DEFAULT_SOURCE, USER_AGENT, baseOf, isSourceId } from '@/lib/bangumi'
import { normalizeAirdate, type Episode } from '@/lib/plan'
import { readSession } from '@/lib/session'

/**
 * 批量取条目的正片剧集（含放送日期），给看番时间线用。
 *
 * 一个条目至少一次请求，几百部要好一会儿，所以和 /api/series 一样切块，
 * 由前端连续调用、边拿边画。剧集是公开数据，不带 token，照样能走镜像。
 */

const IDS_MAX = 30
const CONCURRENCY = 6
const PAGE = 100
/** 柯南、海贼王这种上千集的长篇，取到这里为止 */
const MAX_PAGES = 20

async function fetchEpisodes(base: string, id: number): Promise<Episode[]> {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  const out: Episode[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      subject_id: String(id),
      type: '0', // 只要正片，SP/OP/ED 不排
      limit: String(PAGE),
      offset: String(page * PAGE),
    })
    const res = await fetch(`${base}/v0/episodes?${q}`, { headers, cache: 'no-store' })
    if (!res.ok) throw new Error(`episodes ${res.status}`)
    const data = await res.json()
    const list: any[] = data.data ?? []
    for (const e of list) {
      out.push({
        id: e.id,
        sort: e.sort ?? e.ep ?? 0,
        name: e.name_cn || e.name || '',
        airdate: normalizeAirdate(e.airdate),
      })
    }
    if (list.length < PAGE || out.length >= (data.total ?? 0)) break
  }
  return out
}

export async function GET(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: '尚未绑定用户' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const sourceParam = params.get('source')
  const source = isSourceId(sourceParam) ? sourceParam : DEFAULT_SOURCE
  const ids = [
    ...new Set(
      (params.get('ids') ?? '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, IDS_MAX)

  const base = baseOf(source)
  // 取失败的给 null，前端据此不写缓存、下回再试
  const episodes: Record<number, Episode[] | null> = {}

  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++]
        try {
          episodes[id] = await fetchEpisodes(base, id)
        } catch {
          episodes[id] = null
        }
      }
    }),
  )

  return NextResponse.json({ source, episodes }, { headers: { 'Cache-Control': 'no-store' } })
}
