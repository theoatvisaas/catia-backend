import { Request, Response } from "express";
import { z } from "zod";
import { supabaseTable, supabaseAdmin } from "../../lib/supabase";

const bodySchema = z.object({
  email: z.preprocess(
    (v) =>
      String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase(),
    z.string().email(),
  ),
  password: z.string().min(6),
});

export async function signupController(req: Request, res: Response) {
  console.log("signup hit", {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    body: req.body,
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Dados Inválidos" });
  }

  const { email, password } = parsed.data;

  console.log("EMAIL RAW:", JSON.stringify(email), email.length);

  let { data, error } = await supabaseTable.auth.signUp({
    email,
    password,
  });

  if (error || !data.user) {
    console.log("SUPABASE signUp ERROR:", error);
    return res.status(400).json({
      message: error?.message ?? "Não foi possível criar usuário",
      supabase: {
        message: error?.message,
        status: (error as any)?.status,
        name: (error as any)?.name,
      },
    });
  }

  let { error: clientError } = await supabaseAdmin.from("clients").upsert({
    user_id: data.user.id,
    status: true,
    funnel_phase: "trial",
  });

  if (clientError) {
    console.log("SUPABASE clients.upsert ERROR:", clientError);
    return res.status(400).json({
      message: clientError?.message ?? "Não foi possível criar usuário",
      supabase: {
        message: clientError?.message,
        status: (clientError as any)?.status,
        name: (clientError as any)?.name,
      },
    });
  }

  const session = data.session!;

  return res.status(201).json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: { id: data.user.id, email: data.user.email },
  });
}
