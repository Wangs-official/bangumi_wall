'use client'

import { useEffect, useState } from 'react'

/** 偏好都存在本地，换设备重来一次也无所谓。 */
export function usePersisted<T extends object>(key: string, fallback: T, firstRun?: (f: T) => T) {
  // 首屏必须先渲染 fallback，否则服务端渲染结果和客户端对不上。
  const [value, setValue] = useState<T>(fallback)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      // 有存档就用存档，没有才让调用方按环境（比如屏幕宽度）挑默认值
      if (raw) setValue((v) => ({ ...v, ...JSON.parse(raw) }))
      else if (firstRun) setValue(firstRun)
    } catch {
      /* 读不到就用默认值 */
    }
    // 和上面的 setValue 在同一批次里生效，写回 effect 首次运行时读到的已经是存档值
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 无痕模式下写不了，忽略 */
    }
  }, [key, hydrated, value])

  return [value, setValue] as const
}
