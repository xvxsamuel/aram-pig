'use client'

import ErrorMessage from '@/components/ui/ErrorMessage'

interface Props {
  matchesFetched?: number
  totalMatches?: number
  errorCode?: string
  onDismiss: () => void
}

export default function UpdateErrorMessage({ matchesFetched, totalMatches, errorCode, onDismiss }: Props) {
  const message = matchesFetched !== undefined && totalMatches !== undefined && totalMatches > 0
    ? `The update was interrupted after loading ${matchesFetched} of ${totalMatches} matches. Your profile has been updated with the available data.`
    : 'The update was interrupted. Your profile has been updated with any available data.'

  return (
    <ErrorMessage
      title="Update failed"
      message={message}
      errorCode={errorCode}
      onDismiss={onDismiss}
    />
  )
}
