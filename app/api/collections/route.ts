import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { BangumiError, DEFAULT_SOURCE, isSourceId } from '@/lib/bangumi'
import { getCollections } from '@/lib/collections-cache'
import { cookieOptions, ensureToken, readSession, serializeSession } from '@/lib/session'

export async function GET(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: '尚未绑定用户' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const force = params.get('refresh') === '1'
  const sourceParam = params.get('source')
  const source = isSourceId(sourceParam) ? sourceParam : DEFAULT_SOURCE
  const { token, refreshed } = await ensureToken(session, req)

  try {
    const { items, cached } = await getCollections(session.mode, session.username, source, token, force)

    // 内容指纹只看收藏本身。cached 是「这次有没有命中服务端缓存」，
    // 冷热两次值不同，混进哈希会让 ETag 每次都变，304 永远命中不了。
    const itemsJson = JSON.stringify(items)
    const etag = `W/"${createHash('sha1').update(itemsJson).digest('base64url').slice(0, 27)}"`
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
