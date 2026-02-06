import { Request, Response } from "express";
import Stripe from "stripe";
import { handleInvoicePaymentSucceeded } from "../../handlers/stripe/invoicePaymentSucceeded";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
    apiVersion: "2026-01-28.clover",
});

export async function stripeWebHookController(req: Request, res: Response) {
    const sig = req.headers["stripe-signature"] as string | undefined;

    console.log("webhook debug", {
        hasSignature: !!req.headers["stripe-signature"],
        isBuffer: Buffer.isBuffer(req.body),
        bodyType: typeof req.body,
    });


    if (!sig) {
        console.error("Stripe signature ausente");
        return res.status(400).json({ message: "Missing stripe-signature" });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (err) {
        console.error("Assinatura inválida:", err);
        return res.status(400).json({ message: "Invalid signature" });
    }

    try {
        switch (event.type) {
            case "invoice.payment_succeeded":
                await handleInvoicePaymentSucceeded(
                    event.data.object as Stripe.Invoice
                );
                break;

            // futuro
            // case "invoice.payment_failed":
            //   await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
            //   break;

            default:
                console.log(`Evento ignorado: ${event.type}`);
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error("Erro ao processar webhook:", error);
        return res.status(500).json({ message: "Webhook processing error" });
    }
}
