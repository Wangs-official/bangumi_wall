// Bangumi API 客户端。文档: https://bangumi.github.io/api/
// OpenAPI: https://github.com/bangumi/api/blob/master/open-api/v0.yaml

/**
 * 数据源。镜像站是官方 v0 API 的完整替换（路径、字段一致），
 * 并且把封面也镜像到了 bgmimg.anibt.net，国内访问快很多。
 * OAuth 的授权和换 token 始终走官方 bgm.tv，不经过镜像。
 */
export const SOURCES = {
  mirror: { label: '镜像', base: 'https://bgmapi.anibt.net' },
  official: { label: '官方', base: 'https://api.bgm.tv' },
} as const

export type SourceId = keyof typeof SOURCES
export const DEFAULT_SOURCE: SourceId = 'mirror'

export function isSourceId(v: unknown): v is SourceId {
  return typeof v === 'string' && v in SOURCES
}

export function baseOf(source?: string | null) {
  return SOURCES[isSourceId(source) ? source : DEFAULT_SOURCE].base
}

/**
 * 带 token 的请求一律走官方源。
 *
 * 镜像站不转发 Authorization —— 实测带一个无效 token 请求 /v0/me，镜像回
 * 「need Login」（和不带 token 一模一样），官方回「access token has been
 * expired or doesn't exist」。发过去既拿不到私有收藏，也等于白白把 token
 * 交给第三方。镜像图床也不完整（抽查 6 张封面有 1 张 500），所以不做混搭，
 * 认证请求整体走官方。
 */
export function apiBase(token?: string, source?: string | null) {
  return token ? SOURCES.official.base : baseOf(source)
}

export const OAUTH_BASE = 'https://bgm.tv/oauth'

// User-Agent 必须包含开发者 ID 和项目名，用默认 UA 会被封禁。
// 见 https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md
export const USER_AGENT =
  process.env.BGM_USER_AGENT ??
  'Wangs-official/bangumi_wall (https://github.com/Wangs-official/bangumi_wall)'

/** 条目类型。注意没有 5。 */
export const SUBJECT_TYPES = [
  { id: 2, label: '动画' },
  { id: 1, label: '书籍' },
  { id: 4, label: '游戏' },
  { id: 3, label: '音乐' },
  { id: 6, label: '三次元' },
] as const

/** 收藏状态。 */
export const COLLECTION_TYPES = [
  { id: 1, label: '想看' },
  { id: 2, label: '看过' },
  { id: 3, label: '在看' },
  { id: 4, label: '搁置' },
  { id: 5, label: '抛弃' },
] as const

export const SUBJECT_TYPE_LABEL: Record<number, string> = Object.fromEntries(
  SUBJECT_TYPES.map((t) => [t.id, t.label]),
)
export const COLLECTION_TYPE_LABEL: Record<number, string> = Object.fromEntries(
  COLLECTION_TYPES.map((t) => [t.id, t.label]),
)

export interface WallItem {
  id: number
  subjectType: number
  status: number
  name: string
  originalName: string
  cover: string | null
  date: string | null
  score: number | null
  rate: number | null
  epStatus: number
  eps: number
  comment: string
  private: boolean
  updatedAt: string
  rank: number | null
}

/** 条目页地址由 id 推出，不必进载荷 */
export function subjectUrl(id: number) {
  return `https://bgm.tv/subject/${id}`
}

/** 头像档位：s=32、m=48、l=120 */
export function avatarAt(url: string | null | undefined, size: 's' | 'm' | 'l'): string | null {
  if (!url) return null
  // 头像地址形如 /pic/user/l/000/00/00/1_xxx.jpg
  return url.replace(/\/pic\/user\/[slm]\//, `/pic/user/${size}/`)
}

/**
 * 封面图床只支持固定档位的 /r/{宽度}/ 缩放 —— /r/300/ 会返回空响应。
 * 原图约 1013×1500，两个源（lain.bgm.tv 和 bgmimg.anibt.net）档位一致。
 */
export const COVER_WIDTHS = [100, 200, 400, 600, 800] as const
export type CoverWidth = (typeof COVER_WIDTHS)[number]

export function coverAt(url: string | null, width: CoverWidth): string | null {
  if (!url) return null
  return url.replace(/\/r\/\d+\//, `/r/${width}/`)
}

/**
 * 给 <img srcset> 用。配合 sizes，浏览器会按设备像素比自己挑档位：
 * 1× 屏拿小图省流量，2×/3× 屏拿大图不发虚。
 */
export function coverSrcSet(url: string | null, widths: readonly CoverWidth[]): string | undefined {
  if (!url) return undefined
  return widths.map((w) => `${coverAt(url, w)} ${w}w`).join(', ')
}

export interface BangumiUser {
  id: number
  username: string
  nickname: string
  avatar: { large: string; medium: string; small: string }
  sign: string
}

const PAGE_SIZE = 50 // 接口硬上限
const CONCURRENCY = 4 // 并发翻页，别把服务端打疼

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export class BangumiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function get(path: string, token?: string, source?: string | null) {
  const res = await fetch(`${apiBase(token, source)}${path}`, {
    headers: headers(token),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new BangumiError(res.status, `Bangumi API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

/** 校验用户名是否存在，顺便拿到昵称头像。 */
export async function getUser(username: string, token?: string, source?: string | null): Promise<BangumiUser> {
  return get(`/v0/users/${encodeURIComponent(username)}`, token, source)
}

/** 当前 access token 对应的用户。 */
export async function getMe(token: string): Promise<BangumiUser> {
  return get('/v0/me', token)
}

function toWallItem(c: any): WallItem {
  const s = c.subject ?? {}
  return {
    id: c.subject_id,
    subjectType: c.subject_type,
    status: c.type,
    name: s.name_cn || s.name || `条目 ${c.subject_id}`,
    originalName: s.name ?? '',
    cover: s.images?.common ?? s.images?.medium ?? s.images?.large ?? null,
    date: s.date ?? null,
    score: s.score ?? null,
    rate: c.rate || null,
    epStatus: c.ep_status ?? 0,
    eps: s.eps ?? 0,
    comment: c.comment ?? '',
    private: Boolean(c.private),
    updatedAt: c.updated_at,
    rank: s.rank || null,
  }
}

async function fetchPage(username: string, offset: number, token?: string, source?: string | null) {
  const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
  return get(`/v0/users/${encodeURIComponent(username)}/collections?${q}`, token, source)
}

/** 拉取进度回调：已取回的条目数 / 总数。总数在第一页返回后才知道。 */
export type ProgressFn = (loaded: number, total: number) => void

/**
 * 拉取用户全部收藏。先取第一页拿 total，再并发补齐剩余页。
 * 不带 subject_type / type 过滤 —— 全量取回后由前端即时筛选，切换类别不再打网络。
 *
 * 页是并发拉的，回来的顺序不定，所以 onProgress 只报「已回来多少条」，
 * 最后再按 offset 拼回原顺序。
 */
export async function fetchAllCollections(
  username: string,
  token?: string,
  source?: string | null,
  onProgress?: ProgressFn,
): Promise<WallItem[]> {
  const first = await fetchPage(username, 0, token, source)
  const total: number = first.total ?? 0
  const items: any[] = [...(first.data ?? [])]
  let loaded = items.length
  onProgress?.(loaded, total)

  const offsets: number[] = []
  for (let o = PAGE_SIZE; o < total; o += PAGE_SIZE) offsets.push(o)

  const pages = new Map<number, any[]>()
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, async () => {
      while (cursor < offsets.length) {
        const offset = offsets[cursor++]
        const page = await fetchPage(username, offset, token, source)
        const data = page.data ?? []
        pages.set(offset, data)
        loaded += data.length
        onProgress?.(loaded, total)
      }
    }),
  )
  for (const offset of offsets) items.push(...(pages.get(offset) ?? []))

  return items.map(toWallItem)
}

// ---- OAuth2 ----
// https://github.com/bangumi/api/blob/master/docs-raw/How-to-Auth.md

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user_id: number
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_BASE}/authorize?${q}`
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/access_token`, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) {
    throw new BangumiError(res.status, `换取 token 失败 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

export async function refreshAccessToken(
  refreshToken: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/access_token`, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) {
    throw new BangumiError(res.status, `刷新 token 失败 ${res.status}`)
  }
  return res.json()
}
