import { supabaseAdmin } from "../lib/supabase";
import { Consultation, JobStatus } from "../types/consultation";
import { PIPELINE_CONFIG } from "../config/pipeline";
import { downloadChunks } from "./stages/downloadChunks";
import { concatenateAudio } from "./stages/concatenateAudio";
import { uploadFullAudio } from "./stages/uploadFullAudio";
import { cleanupTempFiles, deleteStorageChunks } from "./stages/cleanup";

// Fault injection map (testing only — in-memory, single instance)
export const faultInjectionMap = new Map<string, string>();

// --- Helpers ---

async function updateJobStatus(
    jobId: string,
    status: JobStatus,
    extra?: { error?: string; assembly_transcript_id?: string; completed_at?: string },
): Promise<void> {
    const payload: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
        ...extra,
    };

    console.log(`[UPDATE JOB ${jobId}] Updating — status: "${status}"`, extra ? JSON.stringify(extra) : "");

    const { error, count } = await supabaseAdmin
        .from("consultation_jobs")
        .update(payload)
        .eq("id", jobId);

    if (error) {
        console.error(`[UPDATE JOB ${jobId}] FAILED — error: ${error.message}, code: ${error.code}, details: ${error.details}`);
        throw new Error(`Failed to update job ${jobId} to "${status}": ${error.message}`);
    }

    console.log(`[UPDATE JOB ${jobId}] Success — status: "${status}", rows affected: ${count ?? "unknown"}`);
}

async function fetchConsultation(sessionId: string): Promise<Consultation> {
    const { data, error } = await supabaseAdmin
        .from("consultations")
        .select("*")
        .eq("session_id", sessionId)
        .single<Consultation>();

    if (error || !data) {
        throw new Error(`Consultation not found for session_id: ${sessionId} — ${error?.message}`);
    }
    return data;
}

// --- Main pipeline entry point ---

export async function runPipelineWorker(jobId: string, sessionId: string, failAtStage?: string): Promise<void> {
    const tag = `[PIPELINE ${jobId}]`;
    let tempDir: string | null = null;

    // Save fault injection config for webhook resume (generating_docs)
    if (failAtStage) {
        faultInjectionMap.set(jobId, failAtStage);
        console.log(`${tag} [FAULT INJECTION] Will fail at stage: ${failAtStage}`);
    }

    console.log(`${tag} ========================================`);
    console.log(`${tag} Pipeline started — session_id: ${sessionId}`);
    console.log(`${tag} ========================================`);

    try {
        // Fetch consultation
        console.log(`${tag} Fetching consultation...`);
        const consultation = await fetchConsultation(sessionId);
        console.log(`${tag} Consultation loaded — chunk_count: ${consultation.chunk_count}, storage_prefix: ${consultation.storage_prefix}`);
        console.log(`${tag} Existing data — full_audio_path: ${consultation.full_audio_path ?? "null"}, raw_transcript: ${consultation.raw_transcript ? `${consultation.raw_transcript.length} chars` : "null"}`);

        // --- Granular re-processing check ---

        // Path A: transcript already exists → skip to doc generation
        if (consultation.raw_transcript) {
            console.log(`${tag} [RE-PROCESS] raw_transcript exists — skipping directly to generating_docs`);
            await updateJobStatus(jobId, "generating_docs");

            if (faultInjectionMap.get(jobId) === "generating_docs") {
                faultInjectionMap.delete(jobId);
                throw new Error("[FAULT INJECTION] Simulated failure at stage: generating_docs (raw_transcript already saved)");
            }

            // Dynamic import to avoid loading Phase 5 code at module level
            const { generateDocuments } = await import("./stages/generateDocuments");
            await generateDocuments(jobId, sessionId, consultation.raw_transcript);
            await finalizeJob(jobId, sessionId, tag);
            return;
        }

        // Path B: full audio exists but no transcript → skip to transcription
        if (consultation.full_audio_path) {
            console.log(`${tag} [RE-PROCESS] full_audio_path exists — skipping to transcription`);
            await updateJobStatus(jobId, "transcribing");

            if (faultInjectionMap.get(jobId) === "transcribing") {
                faultInjectionMap.delete(jobId);
                throw new Error("[FAULT INJECTION] Simulated failure at stage: transcribing (full_audio_path already saved)");
            }

            const { submitTranscription } = await import("./stages/submitTranscription");
            const assemblyTranscriptId = await submitTranscription(
                consultation.storage_bucket,
                consultation.full_audio_path,
                jobId,
            );

            await updateJobStatus(jobId, "transcribing", {
                assembly_transcript_id: assemblyTranscriptId,
            });

            console.log(`${tag} Transcription submitted — transcript_id: ${assemblyTranscriptId}`);
            console.log(`${tag} Pipeline PAUSED — waiting for AssemblyAI webhook`);
            return;
        }

        // Path C: full pipeline from scratch
        console.log(`${tag} [FULL PIPELINE] Starting from scratch`);

        // Timeout safety net for pre-webhook stages
        const timeoutMs = PIPELINE_CONFIG.timeouts.totalPreWebhookMs;
        let timedOut = false;
        const timeoutHandle = setTimeout(async () => {
            timedOut = true;
            console.error(`${tag} ======== PIPELINE TIMEOUT ========`);
            console.error(`${tag} Pre-webhook stages exceeded ${timeoutMs}ms limit`);
            try {
                await updateJobStatus(jobId, "failed", { error: `Pipeline timeout: pre-webhook stages exceeded ${timeoutMs / 1000}s` });
            } catch (e) {
                console.error(`${tag} Failed to mark job as failed after timeout:`, e instanceof Error ? e.message : String(e));
            }
        }, timeoutMs);
        console.log(`${tag} Timeout set: ${timeoutMs / 1000}s for pre-webhook stages`);

        const checkTimeout = () => {
            if (timedOut) throw new Error(`Pipeline aborted: timeout exceeded (${timeoutMs / 1000}s)`);
        };

        // --- Stage 1: Download chunks ---
        console.log(`${tag} ---- STAGE 1: DOWNLOADING ----`);
        await updateJobStatus(jobId, "downloading");

        if (faultInjectionMap.get(jobId) === "downloading") {
            faultInjectionMap.delete(jobId);
            throw new Error("[FAULT INJECTION] Simulated failure at stage: downloading");
        }

        const startDownload = Date.now();
        const { chunkPaths, tempDirPath } = await downloadChunks(
            consultation.storage_bucket,
            consultation.storage_prefix,
            consultation.chunk_count,
        );
        tempDir = tempDirPath;
        console.log(`${tag} Download complete — ${chunkPaths.length} chunks in ${Date.now() - startDownload}ms`);
        checkTimeout();

        // --- Stage 2: Concatenate ---
        console.log(`${tag} ---- STAGE 2: CONCATENATING ----`);
        await updateJobStatus(jobId, "concatenating");

        if (faultInjectionMap.get(jobId) === "concatenating") {
            faultInjectionMap.delete(jobId);
            throw new Error("[FAULT INJECTION] Simulated failure at stage: concatenating");
        }

        const startConcat = Date.now();
        const fullAudioLocalPath = await concatenateAudio(chunkPaths, tempDir);
        console.log(`${tag} Concatenation complete — ${Date.now() - startConcat}ms`);
        checkTimeout();

        // --- Stage 3: Upload full audio ---
        console.log(`${tag} ---- STAGE 3: UPLOADING FULL AUDIO ----`);

        if (faultInjectionMap.get(jobId) === "uploading") {
            faultInjectionMap.delete(jobId);
            throw new Error("[FAULT INJECTION] Simulated failure at stage: uploading");
        }

        const startUpload = Date.now();
        const fullAudioStoragePath = await uploadFullAudio(
            fullAudioLocalPath,
            consultation.storage_bucket,
            consultation.storage_prefix,
        );
        console.log(`${tag} Upload complete — path: ${fullAudioStoragePath}, ${Date.now() - startUpload}ms`);

        // Save full_audio_path on consultation
        console.log(`${tag} Updating consultation.full_audio_path...`);
        const { error: pathError } = await supabaseAdmin
            .from("consultations")
            .update({ full_audio_path: fullAudioStoragePath })
            .eq("session_id", sessionId);
        if (pathError) {
            throw new Error(`Failed to save full_audio_path: ${pathError.message}`);
        }
        console.log(`${tag} consultation.full_audio_path updated`);
        checkTimeout();

        // --- Stage 4: Submit transcription ---
        console.log(`${tag} ---- STAGE 4: TRANSCRIBING ----`);
        await updateJobStatus(jobId, "transcribing");

        if (faultInjectionMap.get(jobId) === "transcribing") {
            faultInjectionMap.delete(jobId);
            throw new Error("[FAULT INJECTION] Simulated failure at stage: transcribing (full_audio_path already saved)");
        }

        const { submitTranscription } = await import("./stages/submitTranscription");
        const startTranscribe = Date.now();
        const assemblyTranscriptId = await submitTranscription(
            consultation.storage_bucket,
            fullAudioStoragePath,
            jobId,
        );
        console.log(`${tag} Transcription submitted — transcript_id: ${assemblyTranscriptId}, ${Date.now() - startTranscribe}ms`);

        await updateJobStatus(jobId, "transcribing", {
            assembly_transcript_id: assemblyTranscriptId,
        });

        // Pre-webhook stages done — clear timeout
        clearTimeout(timeoutHandle);
        console.log(`${tag} Timeout cleared — pre-webhook stages completed successfully`);

        // Clean up temp files (already uploaded to storage)
        if (tempDir) {
            console.log(`${tag} Cleaning up temp files...`);
            await cleanupTempFiles(tempDir);
            tempDir = null;
        }

        console.log(`${tag} ========================================`);
        console.log(`${tag} Pipeline PAUSED — waiting for AssemblyAI webhook`);
        console.log(`${tag} transcript_id: ${assemblyTranscriptId}`);
        console.log(`${tag} ========================================`);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${tag} ======== PIPELINE FAILED ========`);
        console.error(`${tag} Error: ${message}`);
        if (err instanceof Error && err.stack) {
            console.error(`${tag} Stack: ${err.stack}`);
        }

        faultInjectionMap.delete(jobId);
        await updateJobStatus(jobId, "failed", { error: message });

        // Cleanup on failure
        if (tempDir) {
            console.log(`${tag} Cleaning up temp files after failure...`);
            await cleanupTempFiles(tempDir).catch(() => {});
        }
    }
}

// --- Resume pipeline from webhook ---

export async function resumePipelineFromTranscription(
    jobId: string,
    sessionId: string,
    webhookData: { status: string; transcriptId: string },
): Promise<void> {
    const tag = `[PIPELINE ${jobId}]`;

    console.log(`${tag} ========================================`);
    console.log(`${tag} Pipeline RESUMED from AssemblyAI webhook`);
    console.log(`${tag} session_id: ${sessionId}`);
    console.log(`${tag} webhook status: ${webhookData.status}`);
    console.log(`${tag} transcript_id: ${webhookData.transcriptId}`);
    console.log(`${tag} ========================================`);

    try {
        // 0. Validate webhook status
        if (webhookData.status !== "completed" && webhookData.status !== "error") {
            console.warn(`${tag} Unexpected webhook status: "${webhookData.status}" — marking as failed`);
            await updateJobStatus(jobId, "failed", { error: `Unexpected AssemblyAI status: "${webhookData.status}"` });
            return;
        }

        // 1. Check webhook status
        if (webhookData.status === "error") {
            // Fetch transcript to get error details
            console.log(`${tag} Webhook reported error — fetching transcript details via SDK...`);
            const { getTranscriptFromAssemblyAI } = await import("../adapters/assemblyai");
            const transcript = await getTranscriptFromAssemblyAI(webhookData.transcriptId);
            throw new Error(
                `AssemblyAI transcription failed: ${transcript.error || "unknown error"}`,
            );
        }

        // 2. Fetch full transcript text via SDK
        console.log(`${tag} Fetching transcript text via SDK — transcript_id: ${webhookData.transcriptId}`);
        const startFetch = Date.now();
        const { getTranscriptFromAssemblyAI } = await import("../adapters/assemblyai");
        const transcript = await getTranscriptFromAssemblyAI(webhookData.transcriptId);
        console.log(`${tag} Transcript fetched — text_length: ${transcript.text?.length ?? 0}, ${Date.now() - startFetch}ms`);

        const transcriptText = transcript.text;
        if (!transcriptText || transcriptText.length === 0) {
            throw new Error("AssemblyAI transcription completed but returned empty text");
        }

        // 3. Save raw transcript to consultation
        console.log(`${tag} Saving raw_transcript to consultation (${transcriptText.length} chars)...`);
        const { error: updateError } = await supabaseAdmin
            .from("consultations")
            .update({ raw_transcript: transcriptText })
            .eq("session_id", sessionId);

        if (updateError) {
            throw new Error(`Failed to save raw_transcript: ${updateError.message}`);
        }
        console.log(`${tag} raw_transcript saved`);

        // --- Stage 5: Generate documents ---
        console.log(`${tag} ---- STAGE 5: GENERATING DOCS ----`);
        await updateJobStatus(jobId, "generating_docs");

        if (faultInjectionMap.get(jobId) === "generating_docs") {
            faultInjectionMap.delete(jobId);
            throw new Error("[FAULT INJECTION] Simulated failure at stage: generating_docs (raw_transcript already saved)");
        }

        const { generateDocuments } = await import("./stages/generateDocuments");
        const startDocGen = Date.now();
        await generateDocuments(jobId, sessionId, transcriptText);
        console.log(`${tag} Document generation complete — ${Date.now() - startDocGen}ms`);

        // --- Finalize ---
        await finalizeJob(jobId, sessionId, tag);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${tag} ======== PIPELINE RESUME FAILED ========`);
        console.error(`${tag} Error: ${message}`);
        if (err instanceof Error && err.stack) {
            console.error(`${tag} Stack: ${err.stack}`);
        }

        faultInjectionMap.delete(jobId);
        await updateJobStatus(jobId, "failed", { error: message });
    }
}

// --- Finalize job ---

async function finalizeJob(jobId: string, sessionId: string, tag: string): Promise<void> {
    console.log(`${tag} ---- FINALIZING ----`);

    // Delete original chunks from storage
    console.log(`${tag} Fetching consultation for chunk cleanup...`);
    const consultation = await fetchConsultation(sessionId);

    console.log(`${tag} Deleting original chunks from storage...`);
    await deleteStorageChunks(
        consultation.storage_bucket,
        consultation.storage_prefix,
        consultation.chunk_count,
    ).catch((err: Error) => {
        console.warn(`${tag} Chunk cleanup warning (non-fatal): ${err.message}`);
    });

    // Mark job completed
    await updateJobStatus(jobId, "completed", {
        completed_at: new Date().toISOString(),
    });

    console.log(`${tag} ========================================`);
    console.log(`${tag} Pipeline COMPLETED successfully`);
    console.log(`${tag} session_id: ${sessionId}`);
    console.log(`${tag} ========================================`);
}
