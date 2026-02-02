import { Response } from "express";
import { z } from "zod";
import { supabaseAuth, supabaseAdmin } from "../../lib/supabase";
import type { AuthedRequest } from "../requireAuth/requireAuth";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function changePasswordController(req: AuthedRequest, res: Response) {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
  }

  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Não autenticado" });
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user?.email) {
    return res.status(401).json({ message: "Token inválido" });
  }

  const { currentPassword, newPassword } = parsed.data;
  const email = userData.user.email;

  const { error: reauthErr } = await supabaseAuth.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (reauthErr) {
    return res.status(401).json({ message: "Senha atual incorreta" });
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
    password: newPassword,
  });

  if (updateErr) {
    return res.status(400).json({ message: updateErr.message });
  }

  return res.status(200).json({ ok: true });
}
