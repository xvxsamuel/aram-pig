import { NextResponse } from "next/server"
import { createAdminClient } from "../../../lib/supabase"
import type { UpdateJobProgress } from "../../../types/update-jobs"

// cleanup stale jobs
async function cleanupStaleJobs(supabase: any) {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  
  // cleanup jobs older than 15 minutes
  await supabase
    .from("update_jobs")
    .update({
      status: "failed",
      error_message: "job timed out after 15 minutes",
      completed_at: new Date().toISOString()
    })
    .in("status", ["pending", "processing"])
    .lt("started_at", fifteenMinutesAgo)
  
  // also cleanup processing jobs with no recent progress (likely orphaned by server restart)
  await supabase
    .from("update_jobs")
    .update({
      status: "failed",
      error_message: "job stalled - no progress in 5 minutes",
      completed_at: new Date().toISOString()
    })
    .eq("status", "processing")
    .lt("updated_at", fiveMinutesAgo)
}

export async function POST(request: Request) {
  try {
    const { puuid } = await request.json()
    
    if (!puuid) {
      return NextResponse.json(
        { error: "puuid is required" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // cleanup stale jobs first
    await cleanupStaleJobs(supabase)

    // get most recent job for this puuid
    const { data: job } = await supabase
      .from("update_jobs")
      .select("*")
      .eq("puuid", puuid)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (!job) {
      return NextResponse.json({
        hasActiveJob: false,
        job: null
      })
    }

    // only return active jobs or recently completed/failed ones (within last 5 minutes)
    const isActive = job.status === "pending" || job.status === "processing"
    const recentlyCompleted = job.completed_at && 
      new Date(job.completed_at).getTime() > Date.now() - 5 * 60 * 1000

    if (!isActive && !recentlyCompleted) {
      return NextResponse.json({
        hasActiveJob: false,
        job: null
      })
    }

    // calculate progress
    const progressPercentage = job.total_matches > 0 
      ? Math.round((job.fetched_matches / job.total_matches) * 100)
      : 0

    const response: UpdateJobProgress = {
      jobId: job.id,
      status: job.status,
      totalMatches: job.total_matches,
      fetchedMatches: job.fetched_matches,
      progressPercentage,
      etaSeconds: job.eta_seconds,
      startedAt: job.started_at,
      errorMessage: job.error_message || undefined
    }

    return NextResponse.json({
      hasActiveJob: isActive,
      job: response
    })

  } catch (error: any) {
    console.error("Update status error:", error)
    return NextResponse.json(
      { error: error.message || "failed to get update status" },
      { status: 500 }
    )
  }
}
