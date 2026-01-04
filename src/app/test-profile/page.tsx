import { Suspense } from 'react'
import { redirect } from 'next/navigation'

// Test profile page that redirects to the mock profile
export default function TestProfilePage() {
  // Redirect to the test summoner profile
  redirect('/na/TestSummoner-TEST')
}
