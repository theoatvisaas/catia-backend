import { Request, Response } from "express";
import { supabaseAdmin } from "../../lib/supabase";
import { ConsultationJob } from "../../types/consultation";

export async function assemblyAiWebhookController(req: Request, res: Response) {
    const tag = "[ASSEMBLYAI WEBHOOK]";
    console.log(`${tag} Webhook received`);
    console.log(`${tag} RAW BODY: ${JSON.stringify(req.body)}`);

    // 1. Validate shared secret token
    const token = req.query.token as string | undefined;
    const expectedToken = process.env.ASSEMBLYAI_WEBHOOK_AUTH_TOKEN;

    if (!expectedToken || token !== expectedToken) {
        console.warn(`${tag} Invalid or missing token`);
        return res.status(401).json({ message: "Unauthorized" });
    }
    console.log(`${tag} Token validated`);

    // 2. Extract data from AssemblyAI webhook payload
    // The webhook is a lightweight notification: only { status, transcript_id }
    // The actual transcript text must be fetched separately via SDK
    const transcriptId = req.body.transcript_id as string | undefined;
    const status = req.body.status as string | undefined;

    console.log(`${tag} Extracted — transcript_id: ${transcriptId}, status: ${status}`);

    if (!transcriptId) {
        console.warn(`${tag} Missing transcript_id in payload`);
        return res.status(400).json({ message: "Missing transcript_id" });
    }

    // 2b. Validate status — only process "completed" or "error"
    if (status !== "completed" && status !== "error") {
        console.warn(`${tag} Unexpected status "${status}" — ignoring webhook`);
        return res.status(200).json({ received: true, ignored: true, reason: `unexpected status: ${status}` });
    }

    // 3. Find job by assembly_transcript_id
    console.log(`${tag} Looking up job for transcript_id: ${transcriptId}`);
    const { data: job, error: jobError } = await supabaseAdmin
        .from("consultation_jobs")
        .select("*")
        .eq("assembly_transcript_id", transcriptId)
        .maybeSingle<ConsultationJob>();

    if (jobError) {
        console.error(`${tag} DB error looking up job: ${jobError.message}, code: ${jobError.code}`);
        return res.status(200).json({ received: true, matched: false });
    }

    if (!job) {
        console.warn(`${tag} No job found with assembly_transcript_id: ${transcriptId}`);
        return res.status(200).json({ received: true, matched: false });
    }
    console.log(`${tag} Job found — job_id: ${job.id}, session_id: ${job.session_id}, current_status: ${job.status}`);

    // 4. Idempotency check — only process if job is in "transcribing" state
    if (job.status !== "transcribing") {
        console.log(`${tag} Job ${job.id} is already "${job.status}" — ignoring duplicate webhook`);
        return res.status(200).json({ received: true, already_processed: true });
    }

    // 5. Respond immediately (200) — then process async
    res.status(200).json({ received: true });
    console.log(`${tag} Response sent (200) — resuming pipeline async`);

    // 6. Fire-and-forget resume pipeline
    import("../../workers/pipelineWorker")
        .then(({ resumePipelineFromTranscription }) => {
            console.log(`${tag} Dispatching resumePipelineFromTranscription — job_id: ${job.id}, transcript_id: ${transcriptId}`);
            resumePipelineFromTranscription(job.id, job.session_id, {
                status: status,
                transcriptId,
            }).catch((err: Error) => {
                console.error(`${tag} Unhandled error resuming pipeline — job_id: ${job.id}:`, err.message);
            });
        })
        .catch(async (err: Error) => {
            console.error(`${tag} Failed to load pipeline worker module:`, err.message);
            try {
                await supabaseAdmin.from("consultation_jobs").update({
                    status: "failed",
                    error: `Internal: failed to load pipeline worker — ${err.message}`,
                    updated_at: new Date().toISOString(),
                }).eq("id", job.id);
            } catch { /* ignore DB error in fallback */ }
        });
}
