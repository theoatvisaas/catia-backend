import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";
import { generateTextWithAi } from "../../adapters/ai";

const normalizeText = (v: unknown) =>
    String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();

const generateBodySchema = z.object({
    transcription: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "transcription obrigatório"),
    document_type_id: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "document_type_id obrigatório"),
});

const uploadBodySchema = z.object({
    title: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "title obrigatório"),
    text: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "text obrigatório"),
    document_type_id: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "document_type_id obrigatório"),
});

const idParamSchema = z.object({
    id: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "id obrigatório"),
});

const updateBodySchema = z.object({
    title: z.string().optional().transform((v) => (v === undefined ? v : normalizeText(v))),
    text: z.string().optional().transform((v) => (v === undefined ? v : normalizeText(v))),
}).refine((v) => (v.title?.length ?? 0) > 0 || (v.text?.length ?? 0) > 0, "Informe title ou text");


export async function documentsCreateController(req: Request, res: Response) {
    console.log("[GENERATE DOCUMENT AI] - STARTED");

    const parsedBody = generateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res
            .status(400)
            .json({ message: "Dados Inválidos", issues: parsedBody.error.issues });
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
            model: dataType.agent_model,
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

export async function documentsUploadController(req: Request, res: Response) {
    console.log("[UPLOAD DOCUMENT] - STARTED");

    const parsedBody = uploadBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res
            .status(400)
            .json({ message: "Dados Inválidos", issues: parsedBody.error.issues });
    }

    const { title, text, document_type_id } = parsedBody.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const { data } = await sb
            .from("documents")
            .insert({
                title,
                text,
                type_id: document_type_id,
            })
            .select("*")
            .maybeSingle()
            .throwOnError();

        if (!data) return res.status(400).json({ message: "Não foi possível criar documento" });

        console.log("[UPLOAD DOCUMENT] - FINISHED");
        return res.status(201).json({ document: data });
    } catch (error: any) {
        console.log("SUPABASE documents INSERT ERROR:", error);
        return res.status(500).json({
            message: "Erro ao salvar documento",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }
}

export async function documentsGetAllController(req: Request, res: Response) {
    console.log("[GET ALL DOCUMENTS] - STARTED");

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const { data } = await sb
            .from("documents")
            .select("id, title, text, type_id")
            .throwOnError();

        console.log("[GET ALL DOCUMENTS] - FINISHED");
        return res.status(200).json({ documents: data ?? [] });
    } catch (error: any) {
        console.log("SUPABASE documents SELECT ALL ERROR:", error);
        return res.status(500).json({
            message: "Erro ao buscar documentos",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }
}

export async function documentsGetController(req: Request, res: Response) {
    console.log("[GET DOCUMENT] - STARTED");

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res
            .status(400)
            .json({ message: "Dados Inválidos", issues: parsedParams.error.issues });
    }

    const { id } = parsedParams.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const { data } = await sb
            .from("documents")
            .select(`id, title, text`)
            .eq("id", id)
            .maybeSingle()
            .throwOnError();

        if (!data) {
            return res.status(404).json({ message: "Documento não encontrado" });
        }

        console.log("[GET DOCUMENT] - FINISHED");
        return res.status(200).json({ document: data });
    } catch (error: any) {
        console.log("SUPABASE documents SELECT ERROR:", error);
        return res.status(500).json({
            message: "Erro ao buscar documento",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }

}

export async function documentsUpdateController(req: Request, res: Response) {
    console.log("[UPDATE DOCUMENT] - STARTED");

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsedParams.error.issues });
    }

    const parsedBody = updateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsedBody.error.issues });
    }

    const { id } = parsedParams.data;
    const { title, text } = parsedBody.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const payload: Record<string, any> = {};
        if (title && title.length) payload.title = title;
        if (text && text.length) payload.text = text;

        const { data } = await sb
            .from("documents")
            .update(payload)
            .eq("id", id)
            .select("id, title, text")
            .maybeSingle()
            .throwOnError();

        if (!data) return res.status(404).json({ message: "Documento não encontrado" });

        console.log("[UPDATE DOCUMENT] - FINISHED");
        return res.status(200).json({ document: data });
    } catch (error: any) {
        console.log("SUPABASE documents UPDATE ERROR:", error);
        return res.status(500).json({
            message: "Erro ao atualizar documento",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }
}

export async function documentsGetByConsultationIdController(req: Request, res: Response) {
    console.log("[GET DOCUMENTS BY CONSULTATION_ID] - STARTED");

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res
            .status(400)
            .json({ message: "Dados Inválidos", issues: parsedParams.error.issues });
    }

    const { id } = parsedParams.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const { data } = await sb
            .from("documents")
            .select("id, title, text, type_id, consultation_id")
            .eq("consultation_id", id)
            .throwOnError();

        console.log("[GET DOCUMENTS BY CONSULTATION_ID] - FINISHED");
        return res.status(200).json({ documents: data ?? [] });
    } catch (error: any) {
        console.log("SUPABASE documents SELECT BY CONSULTATION_ID ERROR:", error);
        return res.status(500).json({
            message: "Erro ao buscar documentos por consultation_id",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }
}