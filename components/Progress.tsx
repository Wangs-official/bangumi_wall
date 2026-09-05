'use client'

/**
 * 进度条两件套。
 *
 * value 传 0~1；传 null 表示「在跑但还不知道总量」，此时画一条来回滑的不确定条
 * （比如刚发出请求、第一页还没回来，总数还不知道）。
 */

function clamp(v: number) {
  return Math.min(1, Math.max(0, v))
}

/** 顶栏按钮里的进度填充，铺在文字底下 */
export function ButtonFill({ value }: { value: number | null }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-y-0 left-0 ${value === null ? 'progress-indeterminate w-1/3' : 'transition-[width] duration-200'}`}
      style={{
        width: value === null ? undefined : `${clamp(value) * 100}%`,
        background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
      }}
    />
  )
}

/** 占一行的进度条，带右侧计数 */
export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="mb-4" role="status" aria-live="polite">
      <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: 'var(--fg-muted)' }}>
        <span>{label}</span>
        {value === null ? null : <span className="tabular-nums">{Math.round(clamp(value) * 100)}%</span>}
      </div>
      <div
        className="h-1 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--fg) 10%, transparent)' }}
      >
        <div
          className={`h-full rounded-full ${value === null ? 'progress-indeterminate w-1/3' : 'transition-[width] duration-200'}`}
          style={{ width: value === null ? undefined : `${clamp(value) * 100}%`, background: 'var(--accent)' }}
        />
      </div>
    </div>
  )
}
