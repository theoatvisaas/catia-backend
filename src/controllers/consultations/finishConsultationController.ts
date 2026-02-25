import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase";
import { Consultation, ConsultationJob, JobStatus } from "../../types/consultation";

const paramsSchema = z.object({
    session_id: z.string().min(1, "session_id obrigatório"),
});

const bodySchema = z.object({
    fail_at_stage: z.enum([
        "downloading",
        "concatenating",
        "uploading",
        "transcribing",
        "generating_docs",
    ]).optional(),
}).optional();

export async function finishConsultationController(req: Request, res: Response) {
    const tag = "[FINISH CONSULTATION]";
    console.log(`${tag} Request received — session_id: ${req.params.session_id}`);

    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
        console.warn(`${tag} Invalid params:`, parsed.error.issues);
        return res.status(400).json({ message: "Parâmetros inválidos", issues: parsed.error.issues });
    }

    const { session_id } = parsed.data;

    if (!req.userId) {
        console.warn(`${tag} Missing userId — auth middleware may have failed`);
        return res.status(401).json({ message: "Não autenticado" });
    }
    const userId = req.userId;

    // Parse optional body for fault injection (testing)
    const body = bodySchema.safeParse(req.body);
    const failAtStage = body.success ? body.data?.fail_at_stage : undefined;
    if (failAtStage) {
        console.log(`${tag} [FAULT INJECTION] Requested failure at stage: ${failAtStage}`);
    }

    console.log(`${tag} Validated — session_id: ${session_id}, user_id: ${userId}`);

    // 1. Fetch consultation
    console.log(`${tag} Fetching consultation from DB...`);
    const { data: consultation, error: consultError } = await supabaseAdmin
        .from("consultations")
        .select("*")
        .eq("session_id", session_id)
        .single<Consultation>();

    if (consultError || !consultation) {
        console.warn(`${tag} Consultation not found — session_id: ${session_id}, error: ${consultError?.message}`);
        return res.status(404).json({ message: "Consulta não encontrada" });
    }
    console.log(`${tag} Consultation found — status: ${consultation.status}, chunk_count: ${consultation.chunk_count}`);

    // 2. Verify ownership
    if (consultation.user_id !== userId) {
        console.warn(`${tag} Ownership mismatch — consultation.user_id: ${consultation.user_id}, request.user_id: ${userId}`);
        return res.status(403).json({ message: "Acesso negado" });
    }

    // 3. Verify status is "synced"
    if (consultation.status !== "synced") {
        console.warn(`${tag} Invalid consultation status: ${consultation.status} (expected "synced")`);
        return res.status(409).json({
            message: "Consulta não está pronta para processamento",
            current_status: consultation.status,
        });
    }

    // 4. Check for existing active job (idempotency)
    console.log(`${tag} Checking for existing active jobs...`);
    const { data: existingJobs, error: jobsError } = await supabaseAdmin
        .from("consultation_jobs")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", { ascending: false })
        .limit(1);

    if (!jobsError && existingJobs && existingJobs.length > 0) {
        const lastJob = existingJobs[0] as ConsultationJob;
        const activeStatuses: JobStatus[] = ["pending", "downloading", "concatenating", "transcribing", "generating_docs"];

        if (lastJob.status === "completed") {
            console.log(`${tag} Last job already completed — job_id: ${lastJob.id}`);
            return res.status(200).json({ job_id: lastJob.id, status: lastJob.status });
        }

        if (activeStatuses.includes(lastJob.status)) {
            console.log(`${tag} Active job found — job_id: ${lastJob.id}, status: ${lastJob.status}`);
            return res.status(200).json({ job_id: lastJob.id, status: lastJob.status });
        }

        console.log(`${tag} Last job is "${lastJob.status}" — will create new job`);
    } else {
        console.log(`${tag} No previous jobs found`);
    }

    // 5. Determine starting status (granular re-processing)
    let initialStatus: JobStatus = "pending";
    if (consultation.raw_transcript) {
        initialStatus = "generating_docs";
        console.log(`${tag} Re-processing: raw_transcript exists — skipping to generating_docs`);
    } else if (consultation.full_audio_path) {
        initialStatus = "transcribing";
        console.log(`${tag} Re-processing: full_audio_path exists — skipping to transcribing`);
    } else {
        console.log(`${tag} Full pipeline — starting from pending`);
    }

    // 6. Create job
    console.log(`${tag} Creating new job — initial status: ${initialStatus}`);
    const { data: job, error: jobError } = await supabaseAdmin
        .from("consultation_jobs")
        .insert({
            session_id,
            user_id: userId,
            status: initialStatus,
        })
        .select("*")
        .single<ConsultationJob>();

    if (jobError || !job) {
        console.error(`${tag} Failed to create job:`, jobError?.message);
        return res.status(500).json({ message: "Erro ao criar job" });
    }
    console.log(`${tag} Job created — job_id: ${job.id}, status: ${job.status}`);

    // 7. Fire-and-forget pipeline worker
    // NOTE: runPipelineWorker will be imported from src/workers/pipelineWorker.ts (Phase 3)
    // For now, we log the intent — the actual import will be added in Phase 3
    console.log(`${tag} Dispatching pipeline worker (fire-and-forget) — job_id: ${job.id}`);

    // Dynamic import to avoid circular deps and allow Phase 2 to compile without Phase 3
    import("../../workers/pipelineWorker")
        .then(({ runPipelineWorker }) => {
            runPipelineWorker(job.id, session_id, failAtStage).catch((err: Error) => {
                console.error(`${tag} Pipeline worker unhandled error — job_id: ${job.id}:`, err.message);
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

    console.log(`${tag} Response sent — job_id: ${job.id}, status: ${job.status}`);
    return res.status(202).json({ job_id: job.id, status: job.status });
}
