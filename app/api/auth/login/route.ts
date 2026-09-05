import { NextResponse } from 'next/server'
import { authorizeUrl } from '@/lib/bangumi'
import { redirectUri } from '@/lib/session'

export async function GET(req: Request) {
  const clientId = process.env.BGM_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: '未配置 BGM_CLIENT_ID' }, { status: 500 })
  }

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(authorizeUrl(clientId, redirectUri(req), state))
  // state 存进短期 cookie，回调时比对，防 CSRF
  res.cookies.set('bw_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return res
}
