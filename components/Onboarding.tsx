'use client'

import { useState } from 'react'
import { GitHubIcon, REPO_URL } from './Chip'

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
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--fg-muted)' }}
        >
          <GitHubIcon />
          Wangs-official/bangumi_wall
        </a>
      </div>
    </main>
  )
}
