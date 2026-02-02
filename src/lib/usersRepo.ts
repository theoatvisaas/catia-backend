import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export async function findUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,email,password_hash,created_at")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    passwordHash: data.password_hash,
    createdAt: data.created_at,
  };
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
}): Promise<User> {
  const user: User = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    createdAt: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("users").insert({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    created_at: user.createdAt,
  });

  if (error) {
    // ideal: mapear erro de unique constraint do email aqui
    throw new Error(error.message);
  }

  return user;
}
