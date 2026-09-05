'use client'

import { useState } from 'react'

export function Onboarding({ oauthEnabled, initialError }: { oauthEnabled: boolean; initialError?: string }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [busy, setBusy] = useState(false)

  async function bind(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '绑定失败')
      location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定失败')
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="panel w-full max-w-md rounded-2xl p-8" style={{ boxShadow: 'var(--shadow)' }}>
        <h1 className="text-2xl font-semibold">我的班固米墙</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--fg-muted)' }}>
          把你在 Bangumi 的收藏铺成一面墙
        </p>

        {oauthEnabled ? (
          <>
            <a
              href="/api/auth/login"
              className="mt-5 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              使用 Bangumi 账号登录
            </a>

            <div className="my-4 flex items-center gap-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
              <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
              或
              <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
            </div>
          </>
        ) : (
          <div className="mt-6" />
        )}

        <form onSubmit={bind}>
          <label className="text-sm font-medium" htmlFor="username">
            绑定用户名
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例如 sai"
            autoComplete="off"
            className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--border)', color: 'var(--fg)' }}
          />
          <p className="mt-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
            如果绑定用户名，只能看见公开收藏
          </p>
          <button
            type="submit"
            disabled={busy || !username.trim()}
            className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'color-mix(in srgb, var(--fg) 10%, transparent)', color: 'var(--fg)' }}
          >
            {busy ? '验证中…' : '开始'}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

        <a
          href="https://github.com/Wangs-official/bangumi_wall"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--fg-muted)' }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          Wangs-official/bangumi_wall
        </a>
      </div>
    </main>
  )
}
