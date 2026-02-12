import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase";
import stripe from "../../lib/stripe";

const bodySchema = z.object({
  name: z.string().min(4),
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
  console.log("[SIGN UP] - STARTED");
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

  const { name, email, password } = parsed.data;

  console.log("EMAIL RAW:", JSON.stringify(email), email.length);

  let { data, error } = await supabaseAdmin.auth.signUp({
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

  const { data: clientSb } = await supabaseAdmin
    .from("clients")
    .upsert({
      user_id: data.user.id,
      name: name,
      status: true,
      funnel_phase: "trial",
    })
    .select("*")
    .single()
    .throwOnError();

  const clientStripe = await stripe.customers.create({
    email,
    name: clientSb.name,
    metadata: { client_id: clientSb.id },
  });

  await supabaseAdmin
    .from("clients")
    .update({
      stripe_customer_id: clientStripe.id,
    })
    .eq("id", clientSb.id)
    .select("id")
    .single()
    .throwOnError();

  const session = data.session!;

  console.log("[SIGN UP] - FINISHED");

  return res.status(201).json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: { id: data.user.id, email: data.user.email },
  });
}
