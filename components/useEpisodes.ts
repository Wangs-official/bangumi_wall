'use client'

import { useEffect, useRef, useState } from 'react'
import type { SourceId } from '@/lib/bangumi'
import { airStatus, todayStr, type Episode } from '@/lib/plan'

const CACHE_KEY = 'bw_eps:v1'
const CHUNK = 30
/** 还在播的剧集表隔几小时就可能变（定档、改期），完结的一周查一次就够 */
const TTL_AIRING = 6 * 3600 * 1000
const TTL_ENDED = 7 * 24 * 3600 * 1000

interface Entry {
  at: number
  eps: Episode[]
}

function readCache(): Record<number, Entry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeCache(c: Record<number, Entry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* 超配额就只在内存里用 */
  }
}

function fresh(e: Entry, today: string) {
  const ttl = airStatus(e.eps, today) === 'ended' ? TTL_ENDED : TTL_AIRING
  return Date.now() - e.at < ttl
}

/**
 * 按条目 id 取剧集，带 localStorage 缓存。
 *
 * ids 会随用户勾选变多，这里只补拉缺的；缓存过期的照常先用旧数据画，后台刷新。
 */
export function useEpisodes(ids: number[], source: SourceId) {
  const [episodes, setEpisodes] = useState<Record<number, Episode[]>>({})
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const cache = useRef<Record<number, Entry> | null>(null)
  /** 已经发出去或已经拿到的，别重复请求 */
  const requested = useRef(new Set<number>())
  const idsKey = ids.join(',')
  // 勾选变化会重跑下面的 effect，但上一批请求不能作废（它们已记在 requested 里），
  // 所以只在整个组件卸载时停止写 state
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!cache.current) {
      cache.current = readCache()
      const init: Record<number, Episode[]> = {}
      for (const [id, e] of Object.entries(cache.current)) init[Number(id)] = e.eps
      setEpisodes(init)
    }
    const c = cache.current
    const today = todayStr()
    const need = ids.filter((id) => !requested.current.has(id) && !(c[id] && fresh(c[id], today)))
    if (!need.length) return
    for (const id of need) requested.current.add(id)

    ;(async () => {
      setProgress((p) => ({ loaded: p?.loaded ?? 0, total: (p?.total ?? 0) + need.length }))
      for (let i = 0; i < need.length; i += CHUNK) {
        const chunk = need.slice(i, i + CHUNK)
        try {
          const res = await fetch(`/api/episodes?ids=${chunk.join(',')}&source=${source}`)
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? '获取剧集失败')
          const got: Record<number, Episode[]> = {}
          for (const [id, eps] of Object.entries(data.episodes as Record<string, Episode[] | null>)) {
            if (!eps) {
              // 这次没取到，允许下次再试
              requested.current.delete(Number(id))
              continue
            }
            got[Number(id)] = eps
            c[Number(id)] = { at: Date.now(), eps }
          }
          writeCache(c)
          // 组件卸载了也照样写缓存，只是不再动 state
          if (alive.current) setEpisodes((prev) => ({ ...prev, ...got }))
        } catch (e) {
          for (const id of chunk) requested.current.delete(id)
          if (alive.current) setError(e instanceof Error ? e.message : '获取剧集失败')
        }
        if (alive.current) {
          setProgress((p) => {
            if (!p) return p
            const loaded = p.loaded + chunk.length
            return loaded >= p.total ? null : { ...p, loaded }
          })
        }
      }
    })()
    // ids 用 join 后的字符串比，免得每次渲染都是新数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, source])

  return { episodes, progress, error }
}
