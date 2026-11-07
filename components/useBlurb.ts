'use client'

import { useEffect, useState } from 'react'
import { blurbBucket } from '@/lib/blurb'

const CACHE_KEY = 'bw_blurb:v1'
/** 改扣除时长时总数会连着变，停下来再取，中间经过的档位不用生成 */
const DEBOUNCE_MS = 800

function readCache(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function remember(bucket: number, text: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [bucket]: text }))
  } catch {
    /* 存不下就下次再取 */
  }
}

/** 这个时长对应的 AI 文案。取不到就是 null：只是点缀，不打扰用户，也不重试 */
export function useBlurb(hours: number, ready: boolean) {
  const bucket = ready ? blurbBucket(hours) : 0
  const [got, setGot] = useState<{ bucket: number; text: string } | null>(null)

  useEffect(() => {
    if (!bucket) return
    const cached = readCache()[bucket]
    if (cached) {
      setGot({ bucket, text: cached })
      return
    }
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/blurb?hours=${bucket}`, { signal: ctl.signal })
        if (!res.ok) return
        const { text } = await res.json()
        remember(bucket, text)
        setGot({ bucket, text })
      } catch {
        /* 取消了或网络不好，不显示就是了 */
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [bucket])

  // 总时长已经变到别的档位时，旧文案不再显示
  return got?.bucket === bucket ? got.text : null
}
