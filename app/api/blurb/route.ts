import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { blurbBucket } from '@/lib/blurb'

/**
 * 看番时长页的 AI 文案。尽量少调模型，层层拦：
 * 1. 只接受 blurbBucket 的档位，用户数据不进 prompt，也就没法拿这个接口当免费模型用
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
const SYSTEM_PROMPT = `你给一个番剧统计页写点评，读者是看动画的人。根据累计看番时长，说清这段时间是什么概念。
语气轻松，可以调侃，但不要刻薄，也不要劝人少看。
只输出正文：一到两句话，不超过 50 个汉字，不加引号、emoji 和标题。
不要复述总小时数。要用数字就只用给出的换算，可以取整，不要自己算或编别的数字。`

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

/** 换算好再给模型，它自己算容易算错 */
function userPrompt(hours: number) {
  const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)
  const evenings = hours / 2
  const span = evenings >= 365 ? `约 ${round(evenings / 365)} 年` : `约 ${round(evenings / 30)} 个月`
  return [
    `累计约 ${hours} 小时。换算：`,
    `不吃不睡连续看约 ${round(hours / 24)} 天；`,
    `每晚看 2 小时要看${span}；`,
    `够看约 ${round(hours / 2)} 部两小时的电影；`,
    `够坐约 ${round(hours / 4.5)} 趟京沪高铁（4.5 小时一趟）。`,
  ].join('')
}

async function generate(hours: number, apiKey: string) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      thinking: { type: 'disabled' }, // 默认会思考，这里用不上，还要多花钱
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(hours) },
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
const inflight = new Map<number, Promise<string>>()

function blurbOf(hours: number, ip: string, apiKey: string) {
  const running = inflight.get(hours)
  if (running) return running
  const cached = unstable_cache(
    async () => {
      takeQuota(ip) // 放在这里面，缓存命中不占额度
      return generate(hours, apiKey)
    },
    // 想换掉所有已生成的文案，改这里的版本号
    ['stats-blurb', 'v1', MODEL, String(hours)],
    { revalidate: false },
  )
  const p = cached().finally(() => inflight.delete(hours))
  inflight.set(hours, p)
  return p
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: '未配置 AI 文案' }, { status: 503, headers: NO_STORE })

  const hours = Number(new URL(req.url).searchParams.get('hours'))
  if (!hours || blurbBucket(hours) !== hours) {
    return NextResponse.json({ error: 'hours 不是有效的档位' }, { status: 400, headers: NO_STORE })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  try {
    const text = await blurbOf(hours, ip, apiKey)
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
