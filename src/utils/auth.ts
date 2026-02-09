import { Request } from "express";
import { supabaseCustomer } from "../lib/supabase";

function getBearerToken(req: Request) {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length ? token : null;
}

export async function getAuthContext(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Token ausente");

  const sb = supabaseCustomer(token);

  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Token inválido ou expirado");
  }

  return { ok: true as const, sb, userId: data.user.id, user: data.user };
}
