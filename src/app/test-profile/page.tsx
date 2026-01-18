'use client'

import ErrorMessage from '@/components/ui/ErrorMessage'
import { useState } from 'react'

// Test profile page for testing ErrorMessage component
// Uses TEST region to avoid interfering with real regions
export default function TestProfilePage() {
  const [showError, setShowError] = useState(true)

  return (
    <div className="min-h-screen bg-abyss-950 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Test Profile (TEST Region)</h1>
        
        {showError && (
          <ErrorMessage
            title="Update failed"
            message="The update was interrupted after loading 684 of 816 matches. Your profile has been updated with the available data."
            errorCode="job timed out after 30 minutes"
            onDismiss={() => setShowError(false)}
          />
        )}

        <button
          onClick={() => setShowError(true)}
          className="mt-4 px-4 py-2 bg-gold-light text-abyss-950 rounded font-medium hover:bg-gold-dark transition-colors"
        >
          Show Error Again
        </button>
      </div>
    </div>
  )
}
