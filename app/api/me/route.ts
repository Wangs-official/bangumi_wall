import { NextResponse } from 'next/server'
import { BangumiError, getUser } from '@/lib/bangumi'
import { clearedCookie, cookieOptions, readSession, serializeSession, type Session } from '@/lib/session'

/** 当前绑定状态。 */
export async function GET() {
  const s = await readSession()
  if (!s) return NextResponse.json({ bound: false })
  return NextResponse.json({
    bound: true,
    mode: s.mode,
    username: s.username,
    nickname: s.nickname ?? s.username,
    avatar: s.avatar ?? null,
  })
}

/** 用用户名绑定（只读公开收藏）。 */
export async function POST(req: Request) {
  const { username, source } = (await req.json().catch(() => ({}))) as {
    username?: string
    source?: string
  }
  const name = username?.trim()
  if (!name) return NextResponse.json({ error: '请输入用户名' }, { status: 400 })

  try {
    const user = await getUser(name, undefined, source)
    const session: Session = {
      mode: 'username',
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar?.large,
    }
    const res = NextResponse.json({
      bound: true,
      mode: session.mode,
      username: session.username,
      nickname: session.nickname,
      avatar: session.avatar,
    })
    res.cookies.set({ ...cookieOptions, value: serializeSession(session) })
    return res
  } catch (e) {
    if (e instanceof BangumiError && e.status === 404) {
      return NextResponse.json({ error: `用户 "${name}" 不存在` }, { status: 404 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : '查询失败' }, { status: 502 })
  }
}

/** 解绑。 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(clearedCookie())
  return res
}
