// src/controllers/client/clientController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { supabaseCustomer } from "../../lib/supabase";

const normalizeText = (v: unknown) =>
    String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();

function getBearerToken(req: Request) {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
}

const createBodySchema = z.object({
    name: z.string().transform((v) => normalizeText(v)).refine((v) => v.length > 0, "name obrigatório"),
    crmv: z.string().transform((v) => normalizeText(v)).nullable().optional(),
    specialty: z.string().transform((v) => normalizeText(v)).nullable().optional(),
    /* status: z.boolean().optional(),
    funnel_phase: z.literal("trial").optional(),
    trial_query_remaining: z.number().int().optional(),
    payment_customer_id: z.string().transform((v) => normalizeText(v)).nullable().optional(),
    payment_customer_status: z.string().transform((v) => normalizeText(v)).nullable().optional(), */
});

const idParamSchema = z.object({
    id: z.string().transform((v) => normalizeText(v)).refine((v) => v.length > 0, "id inválido"),
});

const updateAllowedSchema = z.object({
    name: z.string().transform(normalizeText).refine((v) => v.length > 0, "name obrigatório").optional(),
    crmv: z.string().transform(normalizeText).nullable().optional(),
    specialty: z.string().transform(normalizeText).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" });

// POST /client
export async function createClientController(req: Request, res: Response) {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: "Token ausente" });

    const sb = supabaseCustomer(token);

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
        return res.status(401).json({ message: "Token inválido ou expirado" });
    }

    const userId = userData.user.id;

    const { data: existing, error: existingError } = await sb
        .from("clients")
        .select("id,user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) {
        return res.status(500).json({ message: "Erro ao checar cliente existente", supabase: existingError });
    }

    if (existing) {
        return res.status(409).json({ message: "Cliente já existe para este usuário", client: existing });
    }

    const payload = {
        user_id: userId,
        name: parsed.data.name,
        crmv: parsed.data.crmv ?? null,
        specialty: parsed.data.specialty ?? null,
    };

    const { data, error } = await sb.from("clients").insert(payload).select("*").single();

    if (error || !data) {
        return res.status(400).json({ message: "Não foi possível criar cliente", supabase: error });
    }

    return res.status(201).json({ client: data });
}

// GET /client
export async function getClientByIdController(req: Request, res: Response) {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: "Token ausente" });

    const sb = supabaseCustomer(token);

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
        return res.status(401).json({
            message: "Token inválido ou expirado",
            supabase: {
                message: userError?.message,
                status: (userError as any)?.status,
                name: (userError as any)?.name,
            },
        });
    }

    const userId = userData.user.id;

    console.log(userId);

    const { data, error } = await sb
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    console.log(data)

    if (error) {
        return res.status(500).json({
            message: "Erro ao buscar cliente",
            supabase: {
                message: error.message,
                status: (error as any)?.status,
                name: (error as any)?.name,
            },
        });
    }


    if (!data) {
        return res.status(404).json({ message: "Cliente não encontrado" });
    }

    return res.status(200).json({ client: data });
}


// PUT /client/:id
export async function updateClientByIdController(req: Request, res: Response) {
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res.status(400).json({ message: "Parâmetros inválidos", issues: parsedParams.error.issues });
    }

    const parsedBody = updateAllowedSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsedBody.error.issues });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: "Token ausente" });

    const sb = supabaseCustomer(token);

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
        return res.status(401).json({ message: "Token inválido ou expirado" });
    }
    const userId = userData.user.id;

    const { id } = parsedParams.data;

    const { data, error } = await sb
        .from("clients")
        .update(parsedBody.data)
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

    if (error) {
        return res.status(400).json({ message: "Não foi possível atualizar cliente", supabase: error });
    }
    if (!data) return res.status(404).json({ message: "Cliente não encontrado" });

    return res.status(200).json({ client: data });
}

// DELETE /client/:id
export async function deleteClientByIdController(req: Request, res: Response) {
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return res.status(400).json({ message: "Parâmetros inválidos", issues: parsedParams.error.issues });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: "Token ausente" });

    const sb = supabaseCustomer(token);
    const { id } = parsedParams.data;

    const { data, error } = await sb
        .from("clients")
        .delete()
        .eq("id", id)
        .select("id,user_id")
        .maybeSingle();

    if (error) {
        return res.status(400).json({
            message: "Não foi possível deletar cliente",
            supabase: {
                message: error.message,
                status: (error as any)?.status,
                name: (error as any)?.name,
            },
        });
    }

    if (!data) {
        return res.status(404).json({ message: "Cliente não encontrado" });
    }

    return res.status(200).json({ message: "Cliente deletado", client: data });
}
