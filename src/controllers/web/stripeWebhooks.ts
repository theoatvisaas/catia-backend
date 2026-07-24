import { Request, Response } from "express";
import Stripe from "stripe";
import stripeWebhookHandles from "../../handlers/stripe";
import { supabaseAdmin } from "../../lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
  apiVersion: "2026-01-28.clover",
});

export async function stripeWebhookController(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) {
    return res.status(400).json({ message: "Missing stripe-signature" });
  }
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).json({ message: "Invalid signature" });
  }

  try {
    const { data: existingEvent } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id")
      .eq("stripe_id", event.id)
      .maybeSingle()
      .throwOnError();

    if (existingEvent) {
      return res.status(200).json({ received: true });
    }

    switch (event.type) {
      case "invoice.paid":
        {
          const invoiceWebhook = event.data.object as Stripe.Invoice;

          if (invoiceWebhook.amount_paid === 0) break;

          if (invoiceWebhook.billing_reason === "subscription_create") {
            stripeWebhookHandles.upgradingFirstTime(invoiceWebhook);
          }

          if (invoiceWebhook.metadata?.type === "subscription_plan_upgrade") {
            stripeWebhookHandles.upgradingPlan(invoiceWebhook);
          }
        }
        break;

      default:
        break;
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
    return res.status(500).json({ message: "Webhook processing error" });
  }
}
