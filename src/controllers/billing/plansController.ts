import { Request, Response } from "express";
import { supabaseAdmin } from "../../lib/supabase";

export async function listPlansController(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("id,title,monthly_amount,advantages,isFeatured,stripe_price_id,rank_tier")
    .order("order", { ascending: true });

  if (error) {
    return res.status(500).json({
      message: "Erro ao listar planos",
      supabase: { message: error.message, code: (error as any)?.code },
    });
  }

  return res.status(200).json({ plans: data ?? [] });
}
