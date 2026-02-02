import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../lib/supabase";

export type AuthedRequest = Request & {
    userId?: string;
    userEmail?: string;
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Não autenticado" });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({ message: "Token inválido" });
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email ?? undefined;

    return next();
}
