'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceId, WallItem } from '@/lib/bangumi'

const VERSION = 2
/**
 * 进站即在后台同步一次。只有距上次同步不到这个间隔才跳过 ——
 * 用来挡住页面间来回跳转、以及开发模式下 StrictMode 的重复挂载。
 */
const MIN_SYNC_INTERVAL = 60 * 1000

interface Cached {
  v: number
  items: WallItem[]
  at: number
  etag?: string
}

export interface CollectionsState {
  items: WallItem[] | null
  /** 首次加载、屏幕上还没东西 */
  loading: boolean
  /** 已有内容，正在后台校验 */
  revalidating: boolean
  error: string
  /** 上次真正同步成功的时间戳 */
  syncedAt: number | null
  fromCache: boolean
}

function key(username: string, source: SourceId) {
  return `bw_coll:${username}:${source}`
}

function read(username: string, source: SourceId): Cached | null {
  try {
    const raw = localStorage.getItem(key(username, source))
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    return c.v === VERSION && Array.isArray(c.items) ? c : null
  } catch {
    return null
  }
}

function write(username: string, source: SourceId, c: Cached) {
  try {
    localStorage.setItem(key(username, source), JSON.stringify(c))
  } catch {
    // 超配额（无痕模式、收藏特别多）就放弃缓存，不影响使用
  }
}

/**
 * 收藏数据的加载与缓存。
 *
 * 进站先用 localStorage 里的缓存直接渲染，不等网络（首屏因此瞬开），
 * 同时在后台发一次校验请求把数据刷新到最新。校验带 ETag，
 * 内容没变服务端回 304，省掉几百 KB 下载；变了就无感替换掉页面上的数据。
 */
export function useCollections(username: string, source: SourceId) {
  const [state, setState] = useState<CollectionsState>({
    items: null,
    loading: true,
    revalidating: false,
    error: '',
    syncedAt: null,
    fromCache: false,
  })
  // 换数据源时中断上一轮请求
  const runId = useRef(0)

  const fetchNow = useCallback(
    async (force: boolean, prev: Cached | null) => {
      const id = ++runId.current
      setState((s) => ({
        ...s,
        loading: s.items === null,
        revalidating: s.items !== null,
        error: '',
      }))

      try {
        const q = new URLSearchParams({ source })
        if (force) q.set('refresh', '1')
        const res = await fetch(`/api/collections?${q}`, {
          headers: prev?.etag && !force ? { 'If-None-Match': prev.etag } : {},
        })
        if (runId.current !== id) return

        if (res.status === 304 && prev) {
          // 内容没变，只把「最近校验时间」推后
          const next = { ...prev, at: Date.now() }
          write(username, source, next)
          setState({
            items: prev.items,
            loading: false,
            revalidating: false,
            error: '',
            syncedAt: next.at,
            fromCache: true,
          })
          return
        }

        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? '加载失败')

        const next: Cached = {
          v: VERSION,
          items: data.items as WallItem[],
          at: Date.now(),
          etag: res.headers.get('etag') ?? undefined,
        }
        write(username, source, next)
        setState({
          items: next.items,
          loading: false,
          revalidating: false,
          error: '',
          syncedAt: next.at,
          fromCache: false,
        })
      } catch (e) {
        if (runId.current !== id) return
        setState((s) => ({
          ...s,
          loading: false,
          revalidating: false,
          // 有缓存兜底时不当致命错误，只提示
          error: e instanceof Error ? e.message : '加载失败',
        }))
      }
    },
    [source, username],
  )

  useEffect(() => {
    const cached = read(username, source)
    if (cached) {
      // 先画出来，网络的事之后再说
      setState({
        items: cached.items,
        loading: false,
        revalidating: false,
        error: '',
        syncedAt: cached.at,
        fromCache: true,
      })
      // 刚同步过就不再重复打，其余情况一律后台刷新
      if (Date.now() - cached.at < MIN_SYNC_INTERVAL) return
    } else {
      setState((s) => ({ ...s, items: null, loading: true, syncedAt: null }))
    }
    fetchNow(false, cached)
  }, [username, source, fetchNow])

  const refresh = useCallback(() => {
    fetchNow(true, read(username, source))
  }, [fetchNow, username, source])

  return { ...state, refresh }
}
