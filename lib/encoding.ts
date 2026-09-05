/**
 * base64url 与摘要的通用实现。
 *
 * 不用 Node 的 Buffer / node:crypto —— 那些在 Cloudflare Workers、Edge Runtime 上
 * 要额外开 nodejs_compat 才有。这里只用 Web 标准 API，Node 20+ 同样支持。
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  // 分块避免超长数组撑爆 String.fromCharCode 的参数上限
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function toUrlSafe(b64: string) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromUrlSafe(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  return b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
}

export function encodeBase64Url(text: string): string {
  return toUrlSafe(bytesToBase64(encoder.encode(text)))
}

export function decodeBase64Url(b64url: string): string {
  return decoder.decode(base64ToBytes(fromUrlSafe(b64url)))
}

/** 内容指纹，用于 ETag。取前 27 字符够用，碰撞概率可忽略。 */
export async function sha1Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', encoder.encode(text))
  return toUrlSafe(bytesToBase64(new Uint8Array(digest))).slice(0, 27)
}
