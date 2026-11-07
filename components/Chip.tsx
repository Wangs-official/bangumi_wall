'use client'

/** 顶栏上的小方块开关。 */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'color-mix(in srgb, var(--fg) 8%, transparent)',
        color: active ? '#fff' : 'var(--fg)',
      }}
    >
      {children}
    </button>
  )
}

/** 一组开关 + 前置的组名。 */
export function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

export function Divider() {
  // 手机上分组会换行，竖线夹在中间反而碍眼
  return <span className="mx-1 hidden h-4 w-px sm:inline-block" style={{ background: 'var(--border)' }} />
}

/** 和顶部类别胶囊栏同款的白底按钮 */
export const BAR_BTN =
  'panel rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80'
export const BAR_BTN_STYLE = { color: 'var(--fg)', boxShadow: 'var(--shadow)' } as const

export const REPO_URL = 'https://github.com/Wangs-official/bangumi_wall'

export function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/** 顶栏的仓库链接。手机上顶栏挤，只留图标 */
export function GitHubLink() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="GitHub 仓库"
      className={`${BAR_BTN} inline-flex h-[30px] items-center gap-1.5`}
      style={BAR_BTN_STYLE}
    >
      <GitHubIcon />
      <span className="hidden sm:inline">GitHub</span>
    </a>
  )
}
