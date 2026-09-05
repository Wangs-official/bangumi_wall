import { redirect } from 'next/navigation'
import { DEFAULT_SOURCE } from '@/lib/bangumi'
import { Grid } from '@/components/Grid'
import { readSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function GridPage() {
  const session = await readSession()
  if (!session) redirect('/')

  return (
    <Grid
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
