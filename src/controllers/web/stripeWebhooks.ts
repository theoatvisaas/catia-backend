import { Request, Response } from "express";
import Stripe from "stripe";
import { handleSubscriptionActive } from "../../handlers/stripe/handleSubscriptionActive";
import { handleSubscribingForTheFirstTime } from "../../handlers/stripe/handleSubscribingForTheFirstTime";
import { supabaseAdmin } from "../../lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
  apiVersion: "2026-01-28.clover",
});

export async function stripeWebhookController(req: Request, res: Response) {
  console.log("[STRIPE WEBHOOK] - RECEIVED");
  console.log();
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

  try {
    const subscriptionWebhook = event.data.object as Stripe.Subscription;
    switch (event.type) {
      case "customer.subscription.updated":
        console.log("[STRIPE WEBHOOK] - EVENT: customer.subscription.updated");
        const { data: subscriptionData } = await supabaseAdmin
          .from("stripe_subscriptions")
          .select("*")
          .eq("stripe_id", subscriptionWebhook.id)
          .maybeSingle()
          .throwOnError();

        // If the customer already has an subscription
        if (!!subscriptionData) {
          console.log("[STRIPE WEBHOOK] - CASE: customer already has an subscription");
        } else {
          // If the customer is upgrading for the first time
          if (subscriptionWebhook.status == "active") {
            console.log("[STRIPE WEBHOOK] - CASE: customer is upgrading for the first time");
            await handleSubscribingForTheFirstTime(subscriptionWebhook);
          }
        }

        // await handleSubscriptionActive(event.data.object as Stripe.Subscription);
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
