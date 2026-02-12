// src/controllers/documents/generateDocumentFromAiController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";
import { generateTextWithAi } from "../../adapters/ai";

const normalizeText = (v: unknown) =>
    String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();

const bodySchema = z.object({
    transcription: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "transcription obrigatório"),
    document_type_id: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "document_type_id obrigatório"),
});

// POST /documents/generate
export async function documentsController(req: Request, res: Response) {
    console.log("[GENERATE DOCUMENT AI] - STARTED");

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsedBody.error.issues });
    }

    const { transcription, document_type_id } = parsedBody.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    let aiText: string;

    const { data: dataType, error: typeError } = await sb
        .from("documents_type")
        .select("agent_services, agent_model, prompt, title")
        .eq("id", document_type_id)
        .single();

    if (typeError || !dataType) {
        return res.status(400).json({
            message: "Tipo de documento não encontrado",
            supabase: {
                message: typeError?.message,
                status: typeError?.code,
            },
        });
    }


    try {
        aiText = await generateTextWithAi({
            provider: dataType.agent_services,
            transcription,
            prompt: dataType.prompt,
            model: dataType.agent_model
        });
    } catch (error: any) {
        console.log("AI GENERATE ERROR:", error);
        return res.status(502).json({
            message: "Erro ao gerar texto com IA",
            provider: dataType.agent_services,
            ai: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }

    try {
        const { data } = await sb
            .from("documents")
            .insert({
                title: dataType.title,
                text: aiText,
                type_id: document_type_id,
            })
            .select("*")
            .maybeSingle()
            .throwOnError();

        if (!data) return res.status(400).json({ message: "Não foi possível criar documento" });

        console.log("[GENERATE DOCUMENT AI] - FINISHED");
        return res.status(201).json({ document: data });
    } catch (error: any) {
        console.log("SUPABASE documents UPSERT ERROR:", error);
        return res.status(500).json({
            message: "Erro ao salvar documento",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
            },
        });
    }
}
