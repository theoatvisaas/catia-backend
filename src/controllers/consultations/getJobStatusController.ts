import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase";
import { ConsultationJob } from "../../types/consultation";

const paramsSchema = z.object({
    job_id: z.string().uuid("job_id inválido"),
});

export async function getJobStatusController(req: Request, res: Response) {
    const tag = "[GET JOB STATUS]";
    console.log(`${tag} Request received — job_id: ${req.params.job_id}`);

    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
        console.warn(`${tag} Invalid params:`, parsed.error.issues);
        return res.status(400).json({ message: "Parâmetros inválidos", issues: parsed.error.issues });
    }

    const { job_id } = parsed.data;

    if (!req.userId) {
        console.warn(`${tag} Missing userId — auth middleware may have failed`);
        return res.status(401).json({ message: "Não autenticado" });
    }
    const userId = req.userId;
    console.log(`${tag} Validated — job_id: ${job_id}, user_id: ${userId}`);

    // 1. Fetch job
    console.log(`${tag} Fetching job from DB...`);
    const { data: job, error: jobError } = await supabaseAdmin
        .from("consultation_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", userId)
        .single<ConsultationJob>();

    if (jobError || !job) {
        console.warn(`${tag} Job not found — job_id: ${job_id}, error: ${jobError?.message}`);
        return res.status(404).json({ message: "Job não encontrado" });
    }
    console.log(`${tag} Job found — status: ${job.status}, session_id: ${job.session_id}`);

    // 2. If completed, fetch generated documents with type info
    let documents: unknown[] | null = null;
    let documentsError: string | null = null;
    if (job.status === "completed") {
        console.log(`${tag} Job completed — fetching documents for session_id: ${job.session_id}`);
        const { data: docs, error: docsError } = await supabaseAdmin
            .from("documents")
            .select("id, session_id, type_id, title, text, documents_type(id, title)")
            .eq("session_id", job.session_id)
            .order("title", { ascending: true });

        if (docsError) {
            console.warn(`${tag} Failed to fetch documents: ${docsError.message}`);
            documentsError = docsError.message;
        } else {
            // Flatten the nested documents_type into type_title for cleaner response
            documents = (docs ?? []).map((doc: Record<string, unknown>) => {
                const docType = doc.documents_type as { id: string; title: string } | null;
                return {
                    id: doc.id,
                    type_id: doc.type_id,
                    type_title: docType?.title ?? null,
                    title: doc.title,
                    text: doc.text,
                };
            });
            console.log(`${tag} Documents fetched — count: ${documents.length}`);
            for (const d of documents as { title: string; type_title: string | null }[]) {
                console.log(`${tag}   - "${d.title}" (type: ${d.type_title ?? "unknown"})`);
            }
        }
    }

    // 3. Build response
    const response: Record<string, unknown> = {
        job_id: job.id,
        session_id: job.session_id,
        status: job.status,
        created_at: job.created_at,
        updated_at: job.updated_at,
    };

    if (job.completed_at) {
        response.completed_at = job.completed_at;
    }

    if (job.error) {
        response.error = job.error;
    }

    if (documents) {
        response.documents = documents;
    }

    if (documentsError) {
        response.documents_error = documentsError;
    }

    console.log(`${tag} Response sent — status: ${job.status}, documents: ${documents ? documents.length : "N/A"}`);
    return res.status(200).json(response);
}
