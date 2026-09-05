import type { Metadata, Viewport } from 'next'
import { avatarAt } from '@/lib/bangumi'
import { readSession } from '@/lib/session'
import './globals.css'

/**
 * 绑定之后用用户头像当站点图标，认起来更直观；没绑定就回落到 bgm.tv 的图标。
 * 图标文件放在 public/ 而不是 app/ —— app/icon.* 是文件约定，会盖掉这里的设置。
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await readSession()
  // favicon 用 48×48 的 m 档就够；添加到主屏的图标要大一些，用 120×120 的 l 档
  const favicon = avatarAt(session?.avatar, 'm')
  const touchIcon = avatarAt(session?.avatar, 'l')

  return {
    title: '我的班固米墙',
    description: '把 Bangumi 上收藏的番剧 / 书籍 / 游戏 / 三次元做成封面墙',
    icons: {
      icon: favicon ?? '/icon.ico',
      apple: touchIcon ?? '/apple-icon.png',
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 允许用户捏合放大看封面细节
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
