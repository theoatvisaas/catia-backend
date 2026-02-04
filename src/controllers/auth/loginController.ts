import { Request, Response } from "express";
import { z } from "zod";
import { supabaseTable } from "../../lib/supabase";

const bodySchema = z.object({
    email: z.string().email().transform((v) => v.trim().toLowerCase()),
    password: z.string().min(1),
});

export async function loginController(req: Request, res: Response) {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
  }

  const { email, password } = parsed.data;

  const { data, error } = await supabaseTable.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    console.log("SUPABASE signInWithPassword ERROR:", error);
    return res.status(401).json({
      message: "Login falhou",
      supabase: {
        message: error?.message,
        status: (error as any)?.status,
        name: (error as any)?.name,
      },
    });
  }

  const { session, user } = data;

  return res.status(200).json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: { id: user.id, email: user.email },
  });
}
