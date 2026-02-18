import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";

const normalizeText = (v: unknown) =>
    String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();

const idParamSchema = z.object({
    id: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "id obrigatório"),
});

const updateBodySchema = z
    .object({
        patient_name: z
            .string()
            .optional()
            .transform((v) => (v === undefined ? v : normalizeText(v))),
        guardian_name: z
            .string()
            .optional()
            .transform((v) => (v === undefined ? v : normalizeText(v))),
    })
    .refine(
        (v) => (v.patient_name?.length ?? 0) > 0 || (v.guardian_name?.length ?? 0) > 0,
        "Informe patient_name ou guardian_name"
    );

export async function consultationsGetController(req: Request, res: Response) {
    console.log("[GET CONSULTATION] - STARTED");

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res.status(400).json({
            message: "Dados Inválidos",
            issues: parsedParams.error.issues,
        });
    }

    const { id } = parsedParams.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const { data, error } = await sb
            .from("consultations")
            .select("id, patient_name, guardian_name")
            .eq("id", id)
            .maybeSingle();

        console.log("SUPABASE GET consultations:", { id, hasData: !!data, error });

        if (error) {
            return res.status(500).json({
                message: "Erro ao buscar consulta",
                supabase: {
                    message: error.message,
                    code: (error as any).code,
                    details: (error as any).details,
                    hint: (error as any).hint,
                },
            });
        }

        if (!data) {
            return res.status(404).json({ message: "Consulta não encontrada" });
        }

        console.log("[GET CONSULTATION] - FINISHED");
        return res.status(200).json({ consultation: data });
    } catch (err: any) {
        console.log("CONSULTATIONS GET UNEXPECTED ERROR:", err);
        return res.status(500).json({
            message: "Erro ao buscar consulta",
            unexpected: {
                message: err?.message,
                name: err?.name,
            },
        });
    }
}


export async function consultationsUpdateController(req: Request, res: Response) {
    console.log("[UPDATE CONSULTATION] - STARTED");

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res.status(400).json({
            message: "Dados Inválidos",
            issues: parsedParams.error.issues,
        });
    }

    const parsedBody = updateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({
            message: "Dados Inválidos",
            issues: parsedBody.error.issues,
        });
    }

    const { id } = parsedParams.data;
    const { patient_name, guardian_name } = parsedBody.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    try {
        const payload: Record<string, any> = {};
        if (patient_name && patient_name.length) payload.patient_name = patient_name;
        if (guardian_name && guardian_name.length) payload.guardian_name = guardian_name;

        const { data } = await sb
            .from("consultations")
            .update(payload)
            .eq("id", id)
            .select("id, patient_name, guardian_name")
            .single()
            .throwOnError();


        if (!data) return res.status(404).json({ message: "Consulta não encontrada" });

        console.log("[UPDATE CONSULTATION] - FINISHED");
        return res.status(200).json({ consultation: data });
    } catch (error: any) {
        console.log("SUPABASE consultations UPDATE ERROR:", error);
        return res.status(500).json({
            message: "Erro ao atualizar consulta",
            supabase: {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
            },
        });
    }
}
