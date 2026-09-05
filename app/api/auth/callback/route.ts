import { NextResponse } from 'next/server'
import { exchangeCode, getMe } from '@/lib/bangumi'
import { appOrigin, cookieOptions, redirectUri, serializeSession, type Session } from '@/lib/session'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = appOrigin(req)
  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/?error=${encodeURIComponent(msg)}`)

  const error = url.searchParams.get('error')
  if (error) return fail(url.searchParams.get('error_description') ?? error)

  const code = url.searchParams.get('code')
  if (!code) return fail('缺少 code')

  const expected = req.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)bw_oauth_state=([^;]+)/)?.[1]
  if (!expected || url.searchParams.get('state') !== expected) {
    return fail('state 校验失败，请重新登录')
  }

  const clientId = process.env.BGM_CLIENT_ID
  const clientSecret = process.env.BGM_CLIENT_SECRET
  if (!clientId || !clientSecret) return fail('服务端未配置 App ID / Secret')

  try {
    const token = await exchangeCode(code, redirectUri(req), clientId, clientSecret)
    const me = await getMe(token.access_token)

    const session: Session = {
      mode: 'oauth',
      username: me.username,
      nickname: me.nickname,
      avatar: me.avatar?.large,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    }

    const res = NextResponse.redirect(origin + '/')
    res.cookies.set({ ...cookieOptions, value: serializeSession(session) })
    res.cookies.set('bw_oauth_state', '', { path: '/', maxAge: 0 })
    return res
  } catch (e) {
    return fail(e instanceof Error ? e.message : '登录失败')
  }
}
