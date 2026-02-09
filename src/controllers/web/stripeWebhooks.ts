import { Request, Response } from "express";
import Stripe from "stripe";
import { handleSubscribingForTheFirstTime } from "../../handlers/stripe";
import { supabaseAdmin } from "../../lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
  apiVersion: "2026-01-28.clover",
});

export async function stripeWebhookController(req: Request, res: Response) {
  console.log("[STRIPE WEBHOOK] - RECEIVED");

  // Verify stripe signature
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
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Assinatura inválida:", err);
    return res.status(400).json({ message: "Invalid signature" });
  }

  // Handles webhook events
  try {
    console.log(`STRIPE WEBHOOK] - EVENT: ${event.type}`);

    switch (event.type) {
      case "customer.subscription.updated":
        {
          const subscriptionWebhook = event.data.object as Stripe.Subscription;

          const { data: subscriptionSb } = await supabaseAdmin
            .from("stripe_subscriptions")
            .select("*")
            .eq("stripe_id", subscriptionWebhook.id)
            .maybeSingle()
            .throwOnError();

          // If the customer is upgrading for the first time
          if (!subscriptionSb && subscriptionWebhook.status == "active") {
            console.log("[STRIPE WEBHOOK] - CASE: customer is upgrading for the first time");
            await handleSubscribingForTheFirstTime(subscriptionWebhook);
          }
        }

        // If the customer is upgrading their existing subcription

        // If the customer is downgrading their existing subcription

        // If the customer has requested to cancel their subscription at the end of period

        // If after cancellation was requested, the customer requested to continue their subscription before the period ends

        // If the subscription has been canceled (manually or due to failed payments)

        // If after the subscription was canceled, the customer resqueted to reactivate their account

        // If an invoice is past due

        // If an invoice payment failed

        // If an invoice payment succeeded

        // If the subscription has become unpaid
        break;

      default:
        console.log(`Evento ignorado: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Erro ao processar webhook:", error);
    return res.status(500).json({ message: "Webhook processing error" });
  }
}
