import { supabaseAdmin } from "../../lib/supabase";
import { generateTextWithAi } from "../../adapters/ai";
import { AiProvider } from "../../adapters/ai/types/types";
import { DocumentType } from "../../types/consultation";

interface DocResult {
    typeId: string;
    title: string;
    success: boolean;
    error?: string;
    durationMs?: number;
}

export async function generateDocuments(
    jobId: string,
    sessionId: string,
    transcription: string,
): Promise<void> {
    const tag = `[GENERATE DOCUMENTS ${jobId}]`;

    // 1. Fetch all document types
    console.log(`${tag} Fetching document types from DB...`);
    const { data: docTypes, error: typesError } = await supabaseAdmin
        .from("documents_type")
        .select("id, title, description, prompt, agent_model, agent_services");

    if (typesError || !docTypes || docTypes.length === 0) {
        throw new Error(`No document types found: ${typesError?.message}`);
    }
    console.log(`${tag} Found ${docTypes.length} document types:`);
    for (const dt of docTypes as DocumentType[]) {
        console.log(`${tag}   - "${dt.title}" → ${dt.agent_services}/${dt.agent_model}`);
    }

    // 2. Generate all documents in parallel
    console.log(`${tag} Starting parallel generation (${docTypes.length} documents)...`);
    const startAll = Date.now();

    const results: DocResult[] = await Promise.all(
        (docTypes as DocumentType[]).map(async (docType): Promise<DocResult> => {
            const dtTag = `${tag} [${docType.title}]`;
            const startOne = Date.now();

            try {
                // Validate provider
                const validProviders = ["openai", "anthropic", "deepseek", "gemini"];
                if (!validProviders.includes(docType.agent_services)) {
                    console.error(`${dtTag} Invalid provider "${docType.agent_services}" — skipping`);
                    return { typeId: docType.id, title: docType.title, success: false, error: `Invalid provider: ${docType.agent_services}` };
                }

                // Validate prompt
                if (!docType.prompt || docType.prompt.trim().length === 0) {
                    console.error(`${dtTag} Empty prompt configured — skipping`);
                    return { typeId: docType.id, title: docType.title, success: false, error: "Empty prompt configured" };
                }

                console.log(`${dtTag} Calling ${docType.agent_services}/${docType.agent_model}...`);

                const aiText = await generateTextWithAi({
                    provider: docType.agent_services as AiProvider,
                    transcription,
                    prompt: docType.prompt,
                    model: docType.agent_model,
                });

                const durationMs = Date.now() - startOne;
                console.log(`${dtTag} AI response received — ${aiText.length} chars, ${durationMs}ms`);

                // Validate AI returned non-empty text
                if (!aiText || aiText.trim().length === 0) {
                    console.error(`${dtTag} AI returned empty text`);
                    return { typeId: docType.id, title: docType.title, success: false, error: "AI returned empty text", durationMs };
                }

                // Save document to DB
                console.log(`${dtTag} Saving to DB...`);
                const { error: insertError } = await supabaseAdmin
                    .from("documents")
                    .insert({
                        session_id: sessionId,
                        type_id: docType.id,
                        title: docType.title,
                        text: aiText,
                    });

                if (insertError) {
                    console.error(`${dtTag} DB insert failed: ${insertError.message}`);
                    return {
                        typeId: docType.id,
                        title: docType.title,
                        success: false,
                        error: `DB insert failed: ${insertError.message}`,
                        durationMs,
                    };
                }

                console.log(`${dtTag} Saved successfully — ${durationMs}ms total`);
                return { typeId: docType.id, title: docType.title, success: true, durationMs };

            } catch (err: unknown) {
                const durationMs = Date.now() - startOne;
                const message = err instanceof Error ? err.message : String(err);
                console.error(`${dtTag} FAILED — ${message} (${durationMs}ms)`);
                return {
                    typeId: docType.id,
                    title: docType.title,
                    success: false,
                    error: message,
                    durationMs,
                };
            }
        }),
    );

    // 3. Summarize results
    const totalMs = Date.now() - startAll;
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    console.log(`${tag} ---- Generation Summary ----`);
    console.log(`${tag} Total time: ${totalMs}ms`);
    console.log(`${tag} Successes: ${successes.length}/${results.length}`);
    for (const s of successes) {
        console.log(`${tag}   ✓ "${s.title}" (${s.durationMs}ms)`);
    }
    if (failures.length > 0) {
        console.log(`${tag} Failures: ${failures.length}/${results.length}`);
        for (const f of failures) {
            console.log(`${tag}   ✗ "${f.title}" — ${f.error} (${f.durationMs}ms)`);
        }
    }

    // 4. Handle failure scenarios
    if (failures.length > 0 && successes.length === 0) {
        // Total failure — throw to mark job as failed
        const errorMsg = `All ${failures.length} documents failed: ` +
            failures.map((f) => `"${f.title}": ${f.error}`).join("; ");
        throw new Error(errorMsg);
    }

    if (failures.length > 0 && successes.length > 0) {
        // Partial failure — save warning in job error field, job will still be marked completed
        const warningMsg = `Partial: ${failures.length}/${results.length} failed. ` +
            failures.map((f) => `"${f.title}": ${f.error}`).join("; ");
        console.warn(`${tag} Saving partial failure warning to job...`);

        const { error: warnError } = await supabaseAdmin
            .from("consultation_jobs")
            .update({ error: warningMsg })
            .eq("id", jobId);

        if (warnError) {
            console.error(`${tag} Failed to save warning to job: ${warnError.message}`);
        } else {
            console.log(`${tag} Warning saved — job will still be marked as completed`);
        }
    }

    console.log(`${tag} Document generation complete`);
}
