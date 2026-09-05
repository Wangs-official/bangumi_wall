import { fetchAllCollections, type SourceId, type WallItem } from './bangumi'

/**
 * 全量收藏缓存。/api/collections 和 /api/series 共用同一份，
 * 免得建系列关系时又把几百条收藏重新翻一遍。
 */
const TTL = 10 * 60 * 1000
const cache = new Map<string, { at: number; items: WallItem[] }>()

function key(mode: string, username: string, source: SourceId) {
  return `${mode}:${username}:${source}`
}

export function peek(mode: string, username: string, source: SourceId) {
  const hit = cache.get(key(mode, username, source))
  return hit && Date.now() - hit.at < TTL ? hit.items : null
}

export async function getCollections(
  mode: string,
  username: string,
  source: SourceId,
  token?: string,
  force = false,
): Promise<{ items: WallItem[]; cached: boolean }> {
  const cached = force ? null : peek(mode, username, source)
  if (cached) return { items: cached, cached: true }

  const items = await fetchAllCollections(username, token, source)
  cache.set(key(mode, username, source), { at: Date.now(), items })
  return { items, cached: false }
}
