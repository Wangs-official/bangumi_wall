import { redirect } from 'next/navigation'
import { DEFAULT_SOURCE } from '@/lib/bangumi'
import { Plan } from '@/components/Plan'
import { readSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const session = await readSession()
  if (!session) redirect('/')

  return (
    <Plan
      me={{
        username: session.username,
        nickname: session.nickname ?? session.username,
        avatar: session.avatar ?? null,
        mode: session.mode,
      }}
      source={DEFAULT_SOURCE}
    />
  )
}
