import { NextResponse } from 'next/server'
import { BangumiError, DEFAULT_SOURCE, isSourceId, type SourceId } from '@/lib/bangumi'
import { getCollections } from '@/lib/collections-cache'
import { sha1Base64Url } from '@/lib/encoding'
import { cookieOptions, ensureToken, readSession, serializeSession } from '@/lib/session'

export async function GET(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: '尚未绑定用户' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const force = params.get('refresh') === '1'
  const sourceParam = params.get('source')
  const requested = isSourceId(sourceParam) ? sourceParam : DEFAULT_SOURCE
  const { token, refreshed } = await ensureToken(session, req)
  // 镜像不转发 Authorization，带 token 就只能走官方源。缓存键也用这个实际值，
  // 免得 OAuth 用户来回切换数据源时反复重拉同一份数据。
  const source: SourceId = token ? 'official' : requested

  try {
    const { items, cached } = await getCollections(session.mode, session.username, source, token, force)

    // 内容指纹只看收藏本身。cached 是「这次有没有命中服务端缓存」，
    // 冷热两次值不同，混进哈希会让 ETag 每次都变，304 永远命中不了。
    const itemsJson = JSON.stringify(items)
    const etag = `W/"${await sha1Base64Url(itemsJson)}"`
    const body = `{"username":${JSON.stringify(session.username)},"source":"${source}","total":${items.length},"cached":${cached},"items":${itemsJson}}`

    if (!force && req.headers.get('if-none-match') === etag) {
      const notModified = new NextResponse(null, { status: 304, headers: { ETag: etag } })
      if (refreshed) notModified.cookies.set({ ...cookieOptions, value: serializeSession(refreshed) })
      return notModified
    }

    const res = new NextResponse(body, {
      headers: { 'Content-Type': 'application/json', ETag: etag },
    })
    if (refreshed) res.cookies.set({ ...cookieOptions, value: serializeSession(refreshed) })
    return res
  } catch (e) {
    const status = e instanceof BangumiError ? e.status : 502
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '拉取收藏失败' },
      { status: status === 401 ? 401 : 502 },
    )
  }
}
