import { Request, Response } from "express";
import { z } from "zod";
import { createUser, findUserByEmail } from "../../lib/usersRepo";
import { hashPassword } from "../../lib/password";

const bodySchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(72),
});

export async function signUpController(req: Request, res: Response) {
  const parsed = bodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid body",
      issues: parsed.error.issues,
    });
  }

  const { email, password } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const passwordHash = hashPassword(password);
  const user = await createUser({ email, passwordHash });

  return res.status(201).json({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  });
}
