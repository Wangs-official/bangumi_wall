import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { blurbInput, blurbKey, type BlurbInput } from '@/lib/blurb'

/**
 * 看番时长页的 AI 文案。尽量少调模型，层层拦：
 * 1. 只接受时长、部数、抛弃数的档位，没有自由文本，也就没法拿这个接口当免费模型用
 * 2. 浏览器和 CDN 都缓存响应；这里不读 cookie，CDN 才能跨用户共用
 * 3. 服务端按档位长期缓存，同一档只生成一次
 * 4. 真要调模型时才计入限流；计数在内存里，每个实例各算各的
 */

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const TIMEOUT_MS = 15_000
/** 约 50 个汉字用不了这么多，留点余量免得截断 */
const MAX_TOKENS = 160
const MAX_CHARS = 120

const PER_IP = { limit: 20, windowMs: 10 * 60_000 }
const GLOBAL = { limit: 60, windowMs: 60 * 60_000 }
/** 超过这么多个 IP 就清掉过期的计数，免得内存涨 */
const MAX_TRACKED_IPS = 1000

// 固定不变放最前面，这样能命中 DeepSeek 的上下文缓存
const SYSTEM_PROMPT = `你是一个懂动画的朋友，看了别人的看番统计，随口评价一句。
角度随你挑：联想、比喻、吐槽、脑洞、反差都行，越意想不到越好。别写成「这些时间够做 X 次 Y」的换算句式，也别用高铁、飞机、马拉松这种常见比较。
语气轻松，可以调侃，但不要刻薄，也不要劝人少看。
只输出一句话，不超过 50 个汉字，不加引号、emoji 和标题，不要复述给出的数字。`

class LimitError extends Error {}

const windows = new Map<string, { count: number; resetAt: number }>()

function hit(key: string, { limit, windowMs }: { limit: number; windowMs: number }, now: number) {
  const w = windows.get(key)
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (w.count >= limit) return false
  w.count++
  return true
}

function takeQuota(ip: string) {
  const now = Date.now()
  if (windows.size > MAX_TRACKED_IPS) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k)
  }
  if (!hit(`ip:${ip}`, PER_IP, now) || !hit('global', GLOBAL, now)) throw new LimitError()
}

function userPrompt({ hours, shows, dropped }: BlurbInput) {
  return `累计看番约 ${hours} 小时，约 ${shows} 部动画，其中抛弃了${dropped ? `约 ${dropped} 部` : ' 0 部'}。`
}

async function generate(input: BlurbInput, apiKey: string) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      thinking: { type: 'disabled' }, // 默认会思考，这里用不上，还要多花钱
      max_tokens: MAX_TOKENS,
      temperature: 1.3, // 偏高一点，写得更跳脱
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`deepseek ${res.status}`)
  const data = await res.json()
  const choice = data.choices?.[0]
  const text = String(choice?.message?.content ?? '').replace(/\s+/g, ' ').trim()
  // 抛错的结果不会进缓存，下次还能重试
  if (choice?.finish_reason !== 'stop' || !text || text.length > MAX_CHARS) {
    throw new Error(`deepseek 返回不可用：${choice?.finish_reason}`)
  }
  return text
}

/** 同一档同时来多个请求时只生成一次 */
const inflight = new Map<string, Promise<string>>()

function blurbOf(input: BlurbInput, ip: string, apiKey: string) {
  const key = blurbKey(input)
  const running = inflight.get(key)
  if (running) return running
  const cached = unstable_cache(
    async () => {
      takeQuota(ip) // 放在这里面，缓存命中不占额度
      return generate(input, apiKey)
    },
    // 想换掉所有已生成的文案，改这里的版本号
    ['stats-blurb', 'v2', MODEL, key],
    { revalidate: false },
  )
  const p = cached().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: '未配置 AI 文案' }, { status: 503, headers: NO_STORE })

  const q = new URL(req.url).searchParams
  const [hours, shows, dropped] = ['hours', 'shows', 'dropped'].map((k) => Number(q.get(k)))
  const input = blurbInput(hours, shows, dropped)
  // 只接受已经是档位的值，别的数字一律拒绝，缓存键才有上限
  if (!input || input.hours !== hours || input.shows !== shows || input.dropped !== dropped) {
    return NextResponse.json({ error: '参数不是有效的档位' }, { status: 400, headers: NO_STORE })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  try {
    const text = await blurbOf(input, ip, apiKey)
    return NextResponse.json(
      { text },
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=2592000' } },
    )
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: '请求太频繁' }, { status: 429, headers: NO_STORE })
    }
    console.error('生成 AI 文案失败', e)
    return NextResponse.json({ error: '生成失败' }, { status: 502, headers: NO_STORE })
  }
}
