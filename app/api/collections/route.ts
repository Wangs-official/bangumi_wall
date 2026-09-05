import { NextResponse } from 'next/server'
import { BangumiError, DEFAULT_SOURCE, isSourceId, type SourceId } from '@/lib/bangumi'
import { getCollections } from '@/lib/collections-cache'
import { sha1Base64Url } from '@/lib/encoding'
import { cookieOptions, ensureToken, readSession, serializeSession } from '@/lib/session'

/**
 * 收藏数据接口。返回 NDJSON 流（一行一条 JSON），而不是一坨等齐了才发的 JSON：
 *
 *   {"type":"progress","loaded":150,"total":1451}   翻页过程中不断上报
 *   {"type":"nochange"}                             内容和调用方手上的一样
 *   {"type":"done", ..., "items":[...]}             最终数据
 *   {"type":"error","error":"..."}                  开流之后才出的错
 *
 * 收藏上千条时翻页要好几秒，进度得让前端画得出来。校验用的 ETag 也随之从响应头
 * 挪进 done/nochange 事件里——流一开头就得发响应头，那会儿还没数据可以算指纹。
 * 省下整包 items 传输的效果和原来的 304 一样。
 */
export async function GET(req: Request) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: '尚未绑定用户' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const force = params.get('refresh') === '1'
  const sourceParam = params.get('source')
  const requested = isSourceId(sourceParam) ? sourceParam : DEFAULT_SOURCE
  // token 要在开流之前拿好：刷新出来的新 token 得靠响应头写回 cookie
  const { token, refreshed } = await ensureToken(session, req)
  // 镜像不转发 Authorization，带 token 就只能走官方源。缓存键也用这个实际值，
  // 免得 OAuth 用户来回切换数据源时反复重拉同一份数据。
  const source: SourceId = token ? 'official' : requested
  const ifNoneMatch = req.headers.get('if-none-match')

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + '\n'))
      try {
        const { items, cached } = await getCollections(
          session.mode,
          session.username,
          source,
          token,
          force,
          (loaded, total) => send(JSON.stringify({ type: 'progress', loaded, total })),
        )

        // 内容指纹只看收藏本身。cached 是「这次有没有命中服务端缓存」，
        // 冷热两次值不同，混进哈希会让 ETag 每次都变，nochange 永远命不中。
        const itemsJson = JSON.stringify(items)
        const etag = `W/"${await sha1Base64Url(itemsJson)}"`

        if (!force && ifNoneMatch === etag) {
          send(JSON.stringify({ type: 'nochange', etag }))
        } else {
          // items 已经是字符串了，别再 stringify 一遍整个对象，几 MB 的数组白转两回
          send(
            `{"type":"done","username":${JSON.stringify(session.username)},"source":"${source}",` +
              `"total":${items.length},"cached":${cached},"etag":${JSON.stringify(etag)},"items":${itemsJson}}`,
          )
        }
      } catch (e) {
        // 响应头早发出去了，错误只能走流里
        const status = e instanceof BangumiError ? e.status : 502
        send(
          JSON.stringify({
            type: 'error',
            status: status === 401 ? 401 : 502,
            error: e instanceof Error ? e.message : '拉取收藏失败',
          }),
        )
      } finally {
        controller.close()
      }
    },
  })

  const res = new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // 别让反代攒够一整包再吐，否则进度事件全堆到最后一起到
      'X-Accel-Buffering': 'no',
    },
  })
  if (refreshed) res.cookies.set({ ...cookieOptions, value: serializeSession(refreshed) })
  return res
}
