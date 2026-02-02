import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAuth, supabaseAdmin } from "../../lib/supabase";

const bodySchema = z.object({
  email: z.preprocess(
    (v) =>
      String(v ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase(),
    z.string().email()
  ),
  password: z.string().min(6),
});


export async function signupController(req: Request, res: Response) {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Dados Inválidos" });
  }

  const { email, password } = parsed.data;

  console.log("EMAIL RAW:", JSON.stringify(email), email.length);

  const { data, error } = await supabaseAuth.auth.signUp({
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


  await supabaseAdmin.from("profiles").upsert({
    id: data.user.id,
    email,
    created_at: new Date().toISOString(),
  });

  const session = data.session;

  if (!session) {

    return res.status(201).json({
      message: "Conta criada. Verifique seu e-mail para confirmar.",
      user: { id: data.user.id, email: data.user.email },
    });
  }

  return res.status(201).json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: { id: data.user.id, email: data.user.email },
  });
}
