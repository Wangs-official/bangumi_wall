import { NextResponse } from 'next/server'
import { DEFAULT_SOURCE, USER_AGENT, baseOf, isSourceId } from '@/lib/bangumi'
import { ensureToken, readSession } from '@/lib/session'

/**
 * 条目搜索。走服务端是为了注入合规 User-Agent，顺带避开浏览器的跨域限制。
 * 用于喜好表里「收藏中没有的作品」——直接搜 Bangumi 全库填进格子。
 */
export async function GET(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: '尚未绑定用户' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const keyword = (params.get('q') ?? '').trim()
  if (!keyword) return NextResponse.json({ results: [] })

  const sourceParam = params.get('source')
  const source = isSourceId(sourceParam) ? sourceParam : DEFAULT_SOURCE
  const type = Number(params.get('type'))

  const { token } = await ensureToken(session, req)
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(`${baseOf(source)}/v0/search/subjects?limit=24`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({
        keyword,
        filter: Number.isFinite(type) && type > 0 ? { type: [type] } : undefined,
      }),
    })
    if (!res.ok) throw new Error(`搜索失败 ${res.status}`)
    const data = await res.json()

    const results = (data.data ?? []).map((s: any) => ({
      id: s.id,
      subjectType: s.type,
      name: s.name_cn || s.name,
      originalName: s.name ?? '',
      cover: s.images?.common ?? s.images?.medium ?? null,
      date: s.date ?? null,
      score: s.score ?? null,
    }))
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '搜索失败' }, { status: 502 })
  }
}
