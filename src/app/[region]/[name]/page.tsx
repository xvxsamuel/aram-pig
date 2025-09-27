import { notFound } from 'next/navigation'

interface Params {
  region: string
  name: string
}

export default async function SummonerPage({ params }: { params: Params }) {
  const { region, name } = params

  return (
    <main className="min-h-screen p-6 text-white space-y-4">
    </main>
  )
}