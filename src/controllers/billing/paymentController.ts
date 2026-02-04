import Stripe from "stripe";
import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET!);

const createCheckoutBodySchema = z.object({
    stripe_price_id: z.string().min(1),
});

async function ensureStripeCustomerId(params: {
    sb: any;
    clientId: string;
    email: string;
    name: string;
}) {
    const { sb, clientId, email, name } = params;

    const { data: client, error: clientError } = await sb
        .from("clients")
        .select("stripe_customer_id")
        .eq("id", clientId)
        .single();

    if (clientError || !client) {
        return { ok: false as const, status: 404 as const, message: "Cliente não encontrado" };
    }

    if (client.stripe_customer_id) {
        return { ok: true as const, customerId: client.stripe_customer_id as string };
    }

    const customer = await stripe.customers.create({
        email,
        name,
        metadata: { client_id: clientId },
    });

    const { error: updateError } = await sb
        .from("clients")
        .update({ stripe_customer_id: customer.id })
        .eq("id", clientId);

    if (updateError) {
        return {
            ok: false as const,
            status: 500 as const,
            message: "Erro ao salvar customer",
            supabase: updateError,
        };
    }

    return { ok: true as const, customerId: customer.id };
}

export async function createCheckoutController(req: Request, res: Response) {
    try {
        const parsed = createCheckoutBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
        }

        const { stripe_price_id } = parsed.data;

        const auth = await getAuthContext(req);
        if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
        
        const { sb } = auth;

        const user = (auth as any).user;
        const userId = user?.id;
        const email = user?.email;

        console.log(userId, email)
        if (!userId || !email) {
            return res.status(401).json({ message: "Token inválido (usuário não encontrado)" });
        }

        const { data: client, error: clientError } = await sb
            .from("clients")
            .select("id, name, stripe_customer_id")
            .eq("user_id", userId)
            .single();

        if (clientError || !client) {
            return res.status(404).json({ message: "Cliente não encontrado para este usuário" });
        }

        const clientId = client.id as string;
        const name = (client.name as string) || email;

        const ensured = await ensureStripeCustomerId({
            sb,
            clientId,
            email,
            name,
        });

        if (!ensured.ok) {
            return res.status(ensured.status).json({
                message: ensured.message,
                ...(ensured as any).supabase ? { supabase: (ensured as any).supabase } : {},
            });
        }

        const customerId = ensured.customerId;

        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: stripe_price_id }],
            payment_behavior: "default_incomplete",
            payment_settings: {
                payment_method_types: ["card"],
                save_default_payment_method: "on_subscription",
            },
            expand: ["latest_invoice.payment_intent"],
        });

        const ephKey = await stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: "2023-10-16" }
        );

        return res.json({
            customerId,
            clientId,
            subscriptionId: subscription.id,
            paymentIntentClientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
            ephemeralKeySecret: ephKey.secret,
        });
    } catch (err) {
        return res.status(500).json({ message: "Stripe error", error: err });
    }
}
