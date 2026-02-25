import { supabaseAdmin } from "../lib/supabase";
import { JobStatus } from "../types/consultation";

const STUCK_STATUSES: JobStatus[] = ["pending", "downloading", "concatenating", "transcribing", "generating_docs"];

export async function recoverStuckJobs(): Promise<void> {
    const tag = "[STARTUP RECOVERY]";
    console.log(`${tag} Checking for stuck jobs...`);

    try {
        const { data: stuckJobs, error } = await supabaseAdmin
            .from("consultation_jobs")
            .select("id, session_id, status, updated_at")
            .in("status", STUCK_STATUSES);

        if (error) {
            console.error(`${tag} Failed to query stuck jobs: ${error.message}`);
            return;
        }

        if (!stuckJobs || stuckJobs.length === 0) {
            console.log(`${tag} No stuck jobs found`);
            return;
        }

        console.log(`${tag} Found ${stuckJobs.length} stuck job(s):`);
        for (const job of stuckJobs) {
            console.log(`${tag}   - job_id: ${job.id}, status: ${job.status}, session_id: ${job.session_id}, updated_at: ${job.updated_at}`);
        }

        const jobIds = stuckJobs.map((j) => j.id);
        const { error: updateError } = await supabaseAdmin
            .from("consultation_jobs")
            .update({
                status: "failed",
                error: "Process restarted while job was in progress",
                updated_at: new Date().toISOString(),
            })
            .in("id", jobIds);

        if (updateError) {
            console.error(`${tag} Failed to update stuck jobs: ${updateError.message}`);
            // Continue to reset consultations even if job update failed
        } else {
            console.log(`${tag} Marked ${stuckJobs.length} stuck job(s) as failed`);
        }

        // Reset consultation status for affected sessions (always attempt, even if job update failed)
        const sessionIds = stuckJobs.map((j) => j.session_id);
        const { error: consultError } = await supabaseAdmin
            .from("consultations")
            .update({ status: "synced" })
            .in("session_id", sessionIds)
            .neq("status", "completed");

        if (consultError) {
            console.warn(`${tag} Failed to reset consultation statuses: ${consultError.message}`);
        } else {
            console.log(`${tag} Reset consultation statuses to "synced" for re-processing`);
        }

        console.log(`${tag} Recovery complete`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${tag} Unexpected error during recovery: ${message}`);
    }
}
