import { NextFunction, Request, Response } from "express";
import { supabaseTable } from "../lib/supabase";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? "";
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
        return res.status(401).json({ message: "Token ausente" });
    }

    const { data, error } = await supabaseTable.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({
            message: "Token inválido",
            supabase: {
                message: error?.message,
                status: (error as any)?.status,
                name: (error as any)?.name,
            },
        });
    }

    (req as any).userId = data.user.id;
    next();
}
