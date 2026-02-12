import { Request, Response } from "express";
import Stripe from "stripe";
import stripeWebhookHandles from "../../handlers/stripe";
import { supabaseAdmin } from "../../lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
  apiVersion: "2026-01-28.clover",
});

export async function stripeWebhookController(req: Request, res: Response) {
  console.log("[STRIPE WEBHOOK] - RECEIVED");

  // Verify stripe signature
  const sig = req.headers["stripe-signature"] as string | undefined;
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
    console.log(`[STRIPE WEBHOOKS] - EVENT: ${event.type}`);

    const { data: existingEvent } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id")
      .eq("stripe_id", event.id)
      .maybeSingle()
      .throwOnError();

    if (existingEvent) {
      console.log(`[STRIPE WEBHOOKS] - Evento ${event.id} já processado anteriormente, ignorando.`);
      return res.status(200).json({ received: true });
    }

    switch (event.type) {
      case "invoice.paid":
        {
          const invoiceWebhook = event.data.object as Stripe.Invoice;

          if (invoiceWebhook.amount_paid === 0) break;

          // If the client is upgrading for the first time
          if (invoiceWebhook.billing_reason === "subscription_create") {
            stripeWebhookHandles.upgradingFirstTime(invoiceWebhook);
          }

          // If the customer is upgrading their existing subcription
          if (invoiceWebhook.metadata?.type === "subscription_plan_upgrade") {
            stripeWebhookHandles.upgradingPlan(invoiceWebhook);
          }
        }

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

    await supabaseAdmin
      .from("stripe_webhook_events")
      .insert({
        stripe_id: event.id,
        data: event,
      })
      .throwOnError();

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Erro ao processar webhook:", error);
    return res.status(500).json({ message: "Webhook processing error" });
  }
}
