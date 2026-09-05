'use client'

import { useEffect } from 'react'

/** 注册 service worker —— 装成应用需要它，同时给离线留个兜底。 */
export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // 等页面加载完再注册，别和首屏抢带宽
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 注册失败不影响正常使用 */
      })
    }
    if (document.readyState === 'complete') register()
    else {
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
