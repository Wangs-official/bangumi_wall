'use client'

import { useEffect } from 'react'

/** 注册 service worker —— 装成应用需要它，同时给离线留个兜底。 */
export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // 开发模式下分块文件名不带哈希，SW 的缓存优先会一直喂旧的 JS/CSS。
    // 不注册，并把以前注册过的清掉
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))
      caches?.keys().then((ks) => ks.filter((k) => k.startsWith('bw-shell')).forEach((k) => caches.delete(k)))
      return
    }
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
