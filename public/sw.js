// 极简 service worker。存在 fetch 监听是 Chrome 判定「可安装」的条件之一，
// 顺带让装成应用后在离线时还能打开。
//
// 刻意不缓存 /api/：收藏数据自己有 localStorage 缓存和 ETag 校验，
// 再套一层只会让「进站自动同步」拿到过期数据。
const CACHE = 'bw-shell-v2'

self.addEventListener('install', (e) => {
  // 首屏资源是在 SW 接管之前加载的，它一次都碰不到，所以这里先把入口页塞进缓存，
  // 否则要等到第二次访问才有东西可离线回退。
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/', '/grid']))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const putIfOk = (req, res) => {
  if (res.ok) {
    const copy = res.clone()
    caches.open(CACHE).then((c) => c.put(req, copy))
  }
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 封面走图床，交给浏览器自己的 HTTP 缓存
  if (url.pathname.startsWith('/api/')) return

  // 构建产物文件名带哈希，内容不会变，缓存优先最快也最省
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => putIfOk(req, res))),
    )
    return
  }

  // 其余走网络优先：部署后 HTML 引用的分块会换名字，缓存优先会白屏
  e.respondWith(
    fetch(req)
      .then((res) => putIfOk(req, res))
      .catch(async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        // 断网时深层路由也退回入口页，好过浏览器的错误页
        if (req.mode === 'navigate') {
          const shell = await caches.match('/')
          if (shell) return shell
        }
        return Response.error()
      }),
  )
})
