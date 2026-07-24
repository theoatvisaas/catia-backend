import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");

export const supabaseAdmin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"));
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
