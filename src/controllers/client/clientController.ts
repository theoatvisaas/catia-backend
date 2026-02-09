// src/controllers/client/clientController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";

const normalizeText = (v: unknown) =>
  String(v ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

const createBodySchema = z.object({
  name: z
    .string()
    .transform((v) => normalizeText(v))
    .refine((v) => v.length > 0, "name obrigatório"),
  crmv: z
    .string()
    .transform((v) => normalizeText(v))
    .nullable()
    .optional(),
  specialty: z
    .string()
    .transform((v) => normalizeText(v))
    .nullable()
    .optional(),
});

const idParamSchema = z.object({
  id: z
    .string()
    .transform((v) => normalizeText(v))
    .refine((v) => v.length > 0, "id inválido"),
});

const updateAllowedSchema = z
  .object({
    name: z
      .string()
      .transform(normalizeText)
      .refine((v) => v.length > 0, "name obrigatório")
      .optional(),
    crmv: z.string().transform(normalizeText).nullable().optional(),
    specialty: z.string().transform(normalizeText).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" });

// GET /client
export async function getClientByIdController(req: Request, res: Response) {
  console.log("[GET CLIENT] - STARTED");
  const auth = await getAuthContext(req);

  const { sb, userId } = auth;

  const { data, error } = await sb.from("clients").select("*").eq("user_id", userId).maybeSingle();

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

  console.log("[GET CLIENT] - FINISHED");
  return res.status(200).json({ client: data });
}

// PUT /client/:id
export async function updateClientByIdController(req: Request, res: Response) {
  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res
      .status(400)
      .json({ message: "Parâmetros inválidos", issues: parsedParams.error.issues });
  }

  const parsedBody = updateAllowedSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ message: "Dados Inválidos", issues: parsedBody.error.issues });
  }

  const auth = await getAuthContext(req);

  const { sb, userId } = auth;
  const { id } = parsedParams.data;

  const { data, error } = await sb
    .from("clients")
    .update(parsedBody.data)
    .eq("id", id)
    .select("*")
    .maybeSingle()
    .throwOnError();

  if (!data) return res.status(404).json({ message: "Cliente não encontrado" });

  return res.status(200).json({ client: data });
}
