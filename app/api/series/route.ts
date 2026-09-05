import { NextResponse } from 'next/server'
import { BangumiError, DEFAULT_SOURCE, baseOf, isSourceId, USER_AGENT } from '@/lib/bangumi'
import { getCollections } from '@/lib/collections-cache'
import type { SeriesEdge } from '@/lib/series'
import { cookieOptions, ensureToken, readSession, serializeSession } from '@/lib/session'

/**
 * 逐条问 Bangumi「这个条目的关联条目有哪些」，挑出续集/前传这类系列关系。
 *
 * 一个条目一次请求，1500 条要两分多钟，同步做必然超时（Vercel 函数还有硬上限），
 * 所以切成小块由前端连续调用，边建边用，进度可见。
 */

/** 算作「同一个系列」的关系类型。番外篇/不同演绎太宽，先不收。 */
const SERIES_RELATIONS = new Set(['续集', '前传'])

const CHUNK_MAX = 60
const CONCURRENCY = 8

export async function GET(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: '尚未绑定用户' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const sourceParam = params.get('source')
  const source = isSourceId(sourceParam) ? sourceParam : DEFAULT_SOURCE
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const limit = Math.min(CHUNK_MAX, Math.max(1, Number(params.get('limit') ?? 40) || 40))

  const { token, refreshed } = await ensureToken(session, req)

  try {
    const { items } = await getCollections(session.mode, session.username, source, token)
    const ids = new Set(items.map((i) => i.id))
    const slice = items.slice(offset, offset + limit)

    const edges: SeriesEdge[] = []
    // 关联条目是公开数据，不带 token，这样才能继续走镜像（镜像不转发 Authorization）
    const base = baseOf(source)
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' }

    let cursor = 0
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, slice.length) }, async () => {
        while (cursor < slice.length) {
          const it = slice[cursor++]
          try {
            const res = await fetch(`${base}/v0/subjects/${it.id}/subjects`, {
              headers,
              cache: 'no-store',
            })
            if (!res.ok) continue
            const related: { id: number; relation: string }[] = await res.json()
            for (const r of related) {
              // 只保留两端都在收藏里的边，其余对这面墙没有意义
              if (SERIES_RELATIONS.has(r.relation) && ids.has(r.id)) edges.push([it.id, r.id])
            }
          } catch {
            // 单个条目查不到就跳过，不让整块失败
          }
        }
      }),
    )

    const next = offset + slice.length
    const res = NextResponse.json({
      source,
      total: items.length,
      offset,
      count: slice.length,
      next: next < items.length ? next : null,
      edges,
    })
    if (refreshed) res.cookies.set({ ...cookieOptions, value: serializeSession(refreshed) })
    return res
  } catch (e) {
    const status = e instanceof BangumiError ? e.status : 502
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '建立系列关系失败' },
      { status: status === 401 ? 401 : 502 },
    )
  }
}
