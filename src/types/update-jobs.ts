// types for update jobs system

export type UpdateJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface UpdateJob {
  id: string
  puuid: string
  status: UpdateJobStatus
  total_matches: number
  fetched_matches: number
  eta_seconds: number
  started_at: string
  completed_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  pending_match_ids?: string[]
  region?: string
}

export interface UpdateJobProgress {
  jobId: string
  status: UpdateJobStatus
  totalMatches: number
  fetchedMatches: number
  progressPercentage: number
  etaSeconds: number
  startedAt: string
  errorMessage?: string
}
