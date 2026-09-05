#!/usr/bin/env node
// 抓取 Bangumi 用户收藏，输出封面墙所需的精简 JSON。
// 用法: node scripts/fetch-collections.mjs <username> [--subject-type 2] [--type 2] [--out data/collections.json]
// 私有收藏需要 access token: BGM_TOKEN=xxx node scripts/fetch-collections.mjs <username>

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const API = 'https://api.bgm.tv'
// User-Agent 必须包含开发者 ID 和项目名，否则可能被封禁
const UA = 'helloquyork/bangumi_wall (https://github.com/helloquyork/bangumi_wall)'
const PAGE_SIZE = 50 // 接口上限

const argv = process.argv.slice(2)
const flags = {}
const positionals = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i]
  else positionals.push(argv[i])
}

const username = positionals[0] ?? process.env.BGM_USERNAME
if (!username) {
  console.error('缺少用户名: node scripts/fetch-collections.mjs <username>')
  process.exit(1)
}

const subjectType = flags['subject-type'] // 1书籍 2动画 3音乐 4游戏 6三次元，留空为全部
const collectionType = flags['type']      // 1想看 2看过 3在看 4搁置 5抛弃，留空为全部
const out = flags['out'] ?? 'data/collections.json'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchPage(offset) {
  const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
  if (subjectType) q.set('subject_type', subjectType)
  if (collectionType) q.set('type', collectionType)

  const headers = { 'User-Agent': UA, Accept: 'application/json' }
  if (process.env.BGM_TOKEN) headers.Authorization = `Bearer ${process.env.BGM_TOKEN}`

  const url = `${API}/v0/users/${encodeURIComponent(username)}/collections?${q}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${await res.text()}`)
  return res.json()
}

const items = []
let offset = 0
let total = Infinity
while (offset < total) {
  const page = await fetchPage(offset)
  total = page.total
  items.push(...page.data)
  offset += PAGE_SIZE
  process.stderr.write(`\r已获取 ${Math.min(offset, total)}/${total}`)
  if (offset < total) await sleep(300) // 对服务端友好一点
}
process.stderr.write('\n')

// 封面墙只需要这些字段
const wall = items.map((c) => ({
  id: c.subject_id,
  type: c.subject_type,          // 1书籍 2动画 3音乐 4游戏 6三次元
  status: c.type,                // 1想看 2看过 3在看 4搁置 5抛弃
  name: c.subject?.name_cn || c.subject?.name,
  originalName: c.subject?.name,
  cover: c.subject?.images?.large ?? null,
  coverGrid: c.subject?.images?.grid ?? null,
  date: c.subject?.date ?? null,
  score: c.subject?.score ?? null,
  myRate: c.rate || null,
  comment: c.comment || '',
  tags: c.tags,
  private: c.private,
  updatedAt: c.updated_at,
  url: `https://bgm.tv/subject/${c.subject_id}`,
}))

await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify({ username, total: wall.length, fetchedAt: new Date().toISOString(), items: wall }, null, 2))
console.log(`写入 ${out}（${wall.length} 条）`)
