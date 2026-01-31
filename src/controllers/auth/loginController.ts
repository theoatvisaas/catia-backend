import { Request, Response } from "express";
import { z } from "zod";
import { findUserByEmail } from "../../lib/usersRepo";
import { verifyPassword } from "../../lib/password";
import jwt from "jsonwebtoken";

const bodySchema = z.object({
    email: z.string().email().transform((v) => v.trim().toLowerCase()),
    password: z.string().min(1),
});

export async function loginController(req: Request, res: Response) {
    const parsed = bodySchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({ message: "Dados Inválidos" });
    }

    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);
    if (!user) {
        return res.status(401).json({ message: "E-mail ou senha incorretos" });
    }

    const passwordValid = verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
        return res.status(401).json({ message: "E-mail ou senha incorretos" });
    }

    const token = jwt.sign(
        { sub: user.id },
        process.env.JWT_SECRET as string,
        { expiresIn: "1d" }
    );

    return res.status(200).json({
        token,
    });
}
