import { Request, Response } from "express";
import { supabaseAdmin } from "../../lib/supabase";

export async function meController(req: Request, res: Response) {
    const userId = (req as any).userId;

    if (!userId) {
        return res.status(401).json({ message: "Não autenticado" });
    }

    // Buscar usuário no Supabase Auth
    const { data: sbUser, error: sbError } =
        await supabaseAdmin.auth.admin.getUserById(userId);

    if (sbError || !sbUser?.user) {
        return res.status(401).json({
            message: "Usuário não encontrado",
            supabase: {
                message: sbError?.message,
                status: (sbError as any)?.status,
                name: (sbError as any)?.name,
            },
        });
    }

    const user = sbUser.user;

    // Buscar client vinculado
    const { data: client, error: clientError } = await supabaseAdmin
        .from("clients")
        .select("id, name, status, funnel_phase, stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (clientError) {
        return res.status(500).json({
            message: "Erro ao buscar client",
            supabase: {
                message: clientError?.message,
                status: (clientError as any)?.status,
                name: (clientError as any)?.name,
            },
        });
    }

    return res.status(200).json({
        user: {
            id: user.id,
            email: user.email,
        },
        client: client ?? null,
    });
}
