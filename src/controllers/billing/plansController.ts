// src/controllers/plans/plansController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { supabaseTable, supabaseAdmin } from "../../lib/supabase";

const normalizeText = (v: unknown) =>
    String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();

const decimalSchema = z.union([
    z.number().finite(),
    z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "decimal inválido"),
]);

function toDecimalString(v: number | string) {
    if (typeof v === "number") return String(v);
    return v;
}

const createPlanSchema = z.object({
    title: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "title obrigatório"),

    monthly_amount: decimalSchema,

    advantages: z
        .array(
            z
                .string()
                .transform((v) => normalizeText(v))
                .refine((v) => v.length > 0, "advantage inválida")
        )
        .default([]),

    isFeatured: z.boolean().default(false),
});

const updatePlanSchema = z.object({
    title: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "title inválido")
        .optional(),

    monthly_amount: decimalSchema.optional(),

    advantages: z
        .array(
            z
                .string()
                .transform((v) => normalizeText(v))
                .refine((v) => v.length > 0, "advantage inválida")
        )
        .optional(),

    isFeatured: z.boolean().optional(),
});

const idParamSchema = z.object({
    id: z
        .string()
        .transform((v) => normalizeText(v))
        .refine((v) => v.length > 0, "id inválido"),
});

//GET /plans
export async function listPlansController(req: Request, res: Response) {
    const { data, error } = await supabaseTable
        .from("plans")
        .select("id,title,monthly_amount,advantages,isFeatured")
        .order("order", { ascending: true })
        //.order("monthly_amount", { ascending: true });

    if (error) {
        return res.status(500).json({
            message: "Erro ao listar planos",
            supabase: { message: error.message, code: (error as any)?.code },
        });
    }

    return res.status(200).json({ plans: data ?? [] });
}

//GET /plans/:id
/* export async function getPlanByIdController(req: Request, res: Response) {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
    }

    const { id } = parsed.data;

    const { data, error } = await supabaseTable
        .from("plans")
        .select("id,title,monthly_amount,advantages,isFeatured")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        return res.status(500).json({
            message: "Erro ao buscar plano",
            supabase: { message: error.message, code: (error as any)?.code },
        });
    }

    if (!data) return res.status(404).json({ message: "Plano não encontrado" });

    return res.status(200).json({ plan: data });
} */

//POST /plans
/* export async function createPlanController(req: Request, res: Response) {
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
        .from("plans")
        .insert({
            title: payload.title,
            monthly_amount: toDecimalString(payload.monthly_amount as any),
            advantages: payload.advantages,
            isFeatured: payload.isFeatured,
        })
        .select("id,title,monthly_amount,advantages,isFeatured")
        .maybeSingle();

    if (error) {
        return res.status(400).json({
            message: "Não foi possível criar plano",
            supabase: { message: error.message, code: (error as any)?.code },
        });
    }

    return res.status(201).json({ plan: data });
} */

//PUT /plans/:id
/* export async function updatePlanController(req: Request, res: Response) {
    const paramsParsed = idParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: paramsParsed.error.issues });
    }

    const bodyParsed = updatePlanSchema.safeParse(req.body);
    if (!bodyParsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: bodyParsed.error.issues });
    }

    const { id } = paramsParsed.data;
    const body = bodyParsed.data;

    if (Object.keys(body).length === 0) {
        return res.status(400).json({ message: "Nenhum campo para atualizar" });
    }

    const update: Record<string, any> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.monthly_amount !== undefined) update.monthly_amount = toDecimalString(body.monthly_amount as any);
    if (body.advantages !== undefined) update.advantages = body.advantages;
    if (body.isFeatured !== undefined) update.isFeatured = body.isFeatured;

    const { data, error } = await supabaseAdmin
        .from("plans")
        .update(update)
        .eq("id", id)
        .select("id,title,monthly_amount,advantages,isFeatured")
        .maybeSingle();

    if (error) {
        return res.status(400).json({
            message: "Não foi possível atualizar plano",
            supabase: { message: error.message, code: (error as any)?.code },
        });
    }

    if (!data) return res.status(404).json({ message: "Plano não encontrado" });

    return res.status(200).json({ plan: data });
} */

//DELETE /plans/:id
/* export async function deletePlanController(req: Request, res: Response) {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
    }

    const { id } = parsed.data;

    const { data, error } = await supabaseAdmin
        .from("plans")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

    if (error) {
        return res.status(400).json({
            message: "Não foi possível deletar plano",
            supabase: { message: error.message, code: (error as any)?.code },
        });
    }

    if (!data) return res.status(404).json({ message: "Plano não encontrado" });

    return res.status(200).json({ message: "Plano deletado", id: data.id });
} */
