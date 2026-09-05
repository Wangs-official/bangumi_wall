'use client'

/** 条目类型图标，混合显示多个类别时贴在封面右上角。 */
const PATHS: Record<number, string> = {
  // 书籍
  1: 'M4 3.5A1.5 1.5 0 0 1 5.5 2H13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 12.5v-9Zm2 .5v8h6.5V4H6Z',
  // 动画
  2: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7ZM6.5 6v4l3.5-2-3.5-2Z',
  // 音乐
  3: 'M12 2.5v7.2a2.3 2.3 0 1 1-1.5-2.15V5.2L7 6v5.2a2.3 2.3 0 1 1-1.5-2.15V4.8L12 2.5Z',
  // 游戏
  4: 'M5 4.5h6a3.5 3.5 0 0 1 3.44 4.15l-.4 2.1A2 2 0 0 1 10.7 11.2L10 10.5H6l-.7.7a2 2 0 0 1-3.34-.45l-.4-2.1A3.5 3.5 0 0 1 5 4.5Zm.5 2v1h-1v1h1v1h1v-1h1v-1h-1v-1h-1Zm5 .5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  // 三次元
  6: 'M2 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm11 1.8 2.2-1.4a.5.5 0 0 1 .8.42v4.36a.5.5 0 0 1-.8.42L13 9.2V6.8Z',
}

export function TypeIcon({ type }: { type: number }) {
  const d = PATHS[type]
  if (!d) return null
  return (
    // 位置和样式沿用原来那个评分角标：右上角、实心圆角块
    <span className="absolute top-1.5 right-1.5 rounded-md bg-emerald-500 px-1.5 py-1 leading-none shadow">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="#fff" className="block" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  )
}
