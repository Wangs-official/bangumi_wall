'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceId } from '@/lib/bangumi'
import type { SeriesEdge } from '@/lib/series'

const CHUNK = 40
const VERSION = 1

interface Cached {
  v: number
  edges: SeriesEdge[]
  done: number
  total: number
  at: number
}

export interface SeriesState {
  edges: SeriesEdge[]
  done: number
  total: number
  building: boolean
  error: string
}

function cacheKey(username: string, source: SourceId) {
  return `bw_series:${username}:${source}`
}

function read(username: string, source: SourceId): Cached | null {
  try {
    const raw = localStorage.getItem(cacheKey(username, source))
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    return c.v === VERSION ? c : null
  } catch {
    return null
  }
}

function write(username: string, source: SourceId, c: Cached) {
  try {
    localStorage.setItem(cacheKey(username, source), JSON.stringify(c))
  } catch {
    /* 存不下就算了，下次重建 */
  }
}

/**
 * 系列关系边的增量构建。
 *
 * 每条收藏都要单独问一次 Bangumi 的关联条目，全量要两分钟，
 * 所以按块拉、边拉边用，结果按「用户 + 数据源」缓存在本地，下次进来直接命中。
 */
export function useSeries(username: string, source: SourceId, enabled: boolean) {
  const [state, setState] = useState<SeriesState>({
    edges: [],
    done: 0,
    total: 0,
    building: false,
    error: '',
  })
  // 用来中断上一轮构建：换数据源或关掉开关时，旧的循环必须停下
  const runId = useRef(0)

  const build = useCallback(
    async (from: number, seed: SeriesEdge[]) => {
      const id = ++runId.current
      setState((s) => ({ ...s, building: true, error: '' }))

      let edges = seed
      let offset = from
      try {
        for (;;) {
          const q = new URLSearchParams({ source, offset: String(offset), limit: String(CHUNK) })
          const res = await fetch(`/api/series?${q}`)
          const data = await res.json()
          if (runId.current !== id) return // 已经被新的构建取代
          if (!res.ok) throw new Error(data.error ?? '建立系列关系失败')

          edges = edges.concat(data.edges as SeriesEdge[])
          const done = data.offset + data.count
          write(username, source, { v: VERSION, edges, done, total: data.total, at: Date.now() })
          setState({ edges, done, total: data.total, building: data.next !== null, error: '' })

          if (data.next === null) return
          offset = data.next
        }
      } catch (e) {
        if (runId.current !== id) return
        setState((s) => ({ ...s, building: false, error: e instanceof Error ? e.message : '构建失败' }))
      }
    },
    [source, username],
  )

  useEffect(() => {
    if (!enabled) {
      runId.current++ // 停掉正在跑的构建
      setState({ edges: [], done: 0, total: 0, building: false, error: '' })
      return
    }
    const cached = read(username, source)
    if (cached && cached.done >= cached.total && cached.total > 0) {
      setState({ edges: cached.edges, done: cached.done, total: cached.total, building: false, error: '' })
      return
    }
    // 没缓存或上次没跑完，从断点接着建
    setState({
      edges: cached?.edges ?? [],
      done: cached?.done ?? 0,
      total: cached?.total ?? 0,
      building: true,
      error: '',
    })
    build(cached?.done ?? 0, cached?.edges ?? [])
  }, [enabled, username, source, build])

  const rebuild = useCallback(() => {
    try {
      localStorage.removeItem(cacheKey(username, source))
    } catch {
      /* 忽略 */
    }
    build(0, [])
  }, [build, username, source])

  return { ...state, rebuild }
}
