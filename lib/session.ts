import { cookies } from 'next/headers'
import { refreshAccessToken } from './bangumi'

const COOKIE = 'bw_session'
const MAX_AGE = 60 * 60 * 24 * 180 // 半年

/**
 * 两种绑定方式：
 * - `username` 模式：只存用户名，看公开收藏，无 token
 * - `oauth` 模式：存 access/refresh token，可看私有收藏
 */
export interface Session {
  mode: 'username' | 'oauth'
  username: string
  nickname?: string
  avatar?: string
  accessToken?: string
  refreshToken?: string
  /** access token 过期时间戳（ms） */
  expiresAt?: number
}

export function appOrigin(req: Request) {
  if (process.env.BGM_REDIRECT_URI) return new URL(process.env.BGM_REDIRECT_URI).origin
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

export function redirectUri(req: Request) {
  return process.env.BGM_REDIRECT_URI ?? `${appOrigin(req)}/api/auth/callback`
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Session
  } catch {
    return null
  }
}

export function serializeSession(s: Session) {
  return Buffer.from(JSON.stringify(s), 'utf8').toString('base64url')
}

export const cookieOptions = {
  name: COOKIE,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
}

export function clearedCookie() {
  return { ...cookieOptions, value: '', maxAge: 0 }
}

/**
 * 取出可用的 access token；快过期（<1天）时自动刷新。
 * 返回 `refreshed` 时调用方需要把新 session 写回 cookie。
 */
export async function ensureToken(
  session: Session,
  req: Request,
): Promise<{ token?: string; refreshed?: Session }> {
  if (session.mode !== 'oauth' || !session.accessToken) return {}

  const clientId = process.env.BGM_CLIENT_ID
  const clientSecret = process.env.BGM_CLIENT_SECRET
  const stillFresh = !session.expiresAt || session.expiresAt - Date.now() > 24 * 3600 * 1000
  if (stillFresh || !session.refreshToken || !clientId || !clientSecret) {
    return { token: session.accessToken }
  }

  try {
    const t = await refreshAccessToken(session.refreshToken, redirectUri(req), clientId, clientSecret)
    const refreshed: Session = {
      ...session,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
    }
    return { token: t.access_token, refreshed }
  } catch {
    // 刷新失败就先用旧 token，让 API 自己报 401
    return { token: session.accessToken }
  }
}
