"use client"

interface Props {
  matchesFetched?: number
  totalMatches?: number
  onDismiss: () => void
}

export default function UpdateErrorMessage({ matchesFetched, totalMatches, onDismiss }: Props) {
  return (
    <div className="mb-6 rounded-lg p-px bg-gradient-to-b from-gold-light to-gold-dark" style={{ minHeight: '60px' }}>
      <div className="bg-abyss-800 rounded-[inherit] p-4">
        <div className="flex items-start gap-4">
          <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
              <path d="M12 7v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#dc2626"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="h2 text-lg font-bold mb-1">
              Update failed
            </h2>
            <p className="text-sm text-text-white">
              {matchesFetched !== undefined && totalMatches !== undefined && totalMatches > 0
                ? `The update was interrupted after loading ${matchesFetched} of ${totalMatches} matches. Your profile has been updated with the available data.`
                : 'The update was interrupted. Your profile has been updated with any available data.'
              }
            </p>
          </div>

          <button
            onClick={onDismiss}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gold-light hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
