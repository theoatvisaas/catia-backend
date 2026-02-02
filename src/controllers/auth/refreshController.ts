import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAuth } from "../../lib/supabase";

const bodySchema = z.object({
    refresh_token: z.string().min(1),
});

export async function refreshController(req: Request, res: Response) {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
    }

    const { refresh_token } = parsed.data;

    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
        console.log("SUPABASE refreshSession ERROR:", error);
        return res.status(401).json({
            message: "Refresh falhou",
            supabase: {
                message: error?.message,
                status: (error as any)?.status,
                name: (error as any)?.name,
            },
        });
    }

    const { session, user } = data;

    return res.status(200).json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: session.token_type,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        user: { id: user?.id, email: user?.email },
    });
}
