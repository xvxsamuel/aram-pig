"use client"

interface Props {
  region: string
  name: string
  puuid: string
  hasActiveJob: boolean
  onUpdateStarted: () => void
}

export default function UpdateButton({ hasActiveJob, onUpdateStarted }: Props) {
  const handleUpdate = () => {
    onUpdateStarted()
  }

  return (
    <div className="relative">
      <button 
        onClick={handleUpdate}
        disabled={hasActiveJob}
        className="w-32 px-6 py-2 bg-gradient-to-t cursor-pointer from-action-100 to-action-200 hover:brightness-130 rounded-lg font-semibold transition-all"
        data-update-button
      >
        {hasActiveJob ? 'Updating...' : 'Update'}
      </button>
    </div>
  )
}
