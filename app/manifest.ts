import type { MetadataRoute } from 'next'

/**
 * PWA 清单。装成应用后以 standalone 打开，没有浏览器地址栏。
 * 图标不用用户头像 —— 头像最大只有 120×120，达不到 PWA 要求的 192/512。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '我的班固米墙',
    short_name: '班固米墙',
    description: '把 Bangumi 上收藏的番剧 / 书籍 / 游戏 / 三次元做成封面墙',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eceff4',
    theme_color: '#eceff4',
    lang: 'zh-CN',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // 图案留了安全区，被裁成圆形也不会切到内容
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '封面墙', url: '/' },
      { name: '生涯个人喜好表', url: '/grid' },
    ],
  }
}
