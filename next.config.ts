import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 封面直接走 lain.bgm.tv，不经过 Next 图片优化，避免额外带宽成本
  images: { unoptimized: true },
}

export default nextConfig
