"use client"

interface Props {
  region: string
  name: string
  puuid: string
  hasActiveJob: boolean
  onUpdateStarted: () => void
}

export default function UpdateButton({ region, name, puuid, hasActiveJob, onUpdateStarted }: Props) {
  const handleUpdate = () => {
    onUpdateStarted()
  }

  return (
    <div className="relative">
      <button 
        onClick={handleUpdate}
        disabled={hasActiveJob}
        className="w-32 px-6 py-2 bg-gradient-to-t from-accent-r-dark to-accent-r-light hover:brightness-130 disabled:bg-gray-600 disabled:brightness-100 disabled:cursor-not-allowed rounded-lg font-semibold transition-all"
        data-update-button
      >
        {hasActiveJob ? 'Updating...' : 'Update'}
      </button>
    </div>
  )
}
