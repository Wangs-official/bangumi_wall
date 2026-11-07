'use client'

import { useEffect, useRef, useState } from 'react'
import type { SourceId } from '@/lib/bangumi'
import { airStatus, todayStr, type Episode } from '@/lib/plan'
import { fillFromRuntime, type Runtime } from '@/lib/stats'

/**
 * 单独一份缓存，不和时间线的 bw_eps 共用：这里要存全部看过的番，
 * 带上集名很容易撑爆 localStorage 配额，而统计只需要每集的秒数。
 */
const CACHE_KEY = 'bw_durations:v2'
/** v1 没有用片长补时长，留着也用不上 */
const OLD_CACHE_KEY = 'bw_durations:v1'
const CHUNK = 30
const TTL_AIRING = 6 * 3600 * 1000
/** 完结番的时长基本不会变 */
const TTL_ENDED = 30 * 24 * 3600 * 1000

interface Entry {
  at: number
  ended: boolean
  /** 已播出正片的时长（秒），按集数顺序 */
  d: number[]
}

function readCache(): Record<number, Entry> {
  try {
    localStorage.removeItem(OLD_CACHE_KEY)
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

function toEntry(eps: Episode[], today: string, runtime: Runtime | null | undefined): Entry {
  const aired = eps
    .filter((e) => !e.airdate || e.airdate <= today)
    .sort((a, b) => a.sort - b.sort)
    .map((e) => e.duration ?? 0)
  return { at: Date.now(), ended: airStatus(eps, today) === 'ended', d: fillFromRuntime(aired, runtime) }
}

/** 按条目 id 取每集时长。过期的先用旧数据画，后台刷新；取到一批画一批。 */
export function useDurations(ids: number[], source: SourceId) {
  const [durations, setDurations] = useState<Record<number, number[]>>({})
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const cache = useRef<Record<number, Entry> | null>(null)
  const requested = useRef(new Set<number>())
  const idsKey = ids.join(',')
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
      const init: Record<number, number[]> = {}
      for (const [id, e] of Object.entries(cache.current)) init[Number(id)] = e.d
      setDurations(init)
    }
    const c = cache.current
    const now = Date.now()
    const need = ids.filter((id) => {
      if (requested.current.has(id)) return false
      const e = c[id]
      return !e || now - e.at >= (e.ended ? TTL_ENDED : TTL_AIRING)
    })
    if (!need.length) return
    for (const id of need) requested.current.add(id)

    ;(async () => {
      const today = todayStr()
      setProgress((p) => ({ loaded: p?.loaded ?? 0, total: (p?.total ?? 0) + need.length }))
      for (let i = 0; i < need.length; i += CHUNK) {
        const chunk = need.slice(i, i + CHUNK)
        try {
          const res = await fetch(`/api/episodes?ids=${chunk.join(',')}&source=${source}&runtime=1`)
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? '获取分集时长失败')
          const got: Record<number, number[]> = {}
          for (const [id, eps] of Object.entries(data.episodes as Record<string, Episode[] | null>)) {
            if (!eps) continue // 这次没取到，下次进页面再试
            const entry = toEntry(eps, today, data.runtimes?.[id])
            c[Number(id)] = entry
            got[Number(id)] = entry.d
          }
          writeCache(c)
          if (alive.current) setDurations((prev) => ({ ...prev, ...got }))
        } catch (e) {
          if (alive.current) setError(e instanceof Error ? e.message : '获取分集时长失败')
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

  return { durations, progress, error }
}
