import { NextResponse } from 'next/server'
import { clearedCookie } from '@/lib/session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(clearedCookie())
  return res
}
