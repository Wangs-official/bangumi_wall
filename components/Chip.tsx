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
