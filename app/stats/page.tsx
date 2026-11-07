import { redirect } from 'next/navigation'
import { DEFAULT_SOURCE } from '@/lib/bangumi'
import { Stats } from '@/components/Stats'
import { readSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const session = await readSession()
  if (!session) redirect('/')

  return <Stats username={session.username} source={DEFAULT_SOURCE} aiEnabled={Boolean(process.env.DEEPSEEK_API_KEY)} />
}
