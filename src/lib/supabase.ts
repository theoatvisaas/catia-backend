// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");

// Responsável pelo acesso às tabelas públicas (anon)
export const supabaseTable = createClient(url, anonKey);

// Responsável pelo acesso às tabelas privadas (service_role) — use apenas no backend
export const supabaseAdmin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"));

 // Cria um client "como o usuário" (anonKey + Bearer token), respeitando RLS.
 // Use por request (o token muda).
export function supabaseCustomer(accessToken: string) {
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
