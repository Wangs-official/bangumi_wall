import { Onboarding } from '@/components/Onboarding'
import { Wall } from '@/components/Wall'
import { readSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await readSession()
  const { error } = await searchParams

  if (!session) {
    return (
      <Onboarding
        oauthEnabled={Boolean(process.env.BGM_CLIENT_ID && process.env.BGM_CLIENT_SECRET)}
        initialError={error}
      />
    )
  }

  return (
    <Wall
      me={{
        username: session.username,
        nickname: session.nickname ?? session.username,
        avatar: session.avatar ?? null,
        mode: session.mode,
      }}
    />
  )
}
