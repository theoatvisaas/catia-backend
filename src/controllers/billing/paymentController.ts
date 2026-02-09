import stripe from "../../lib/stripe";
import Stripe from "stripe";
import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";
import { toISO, stripeAmountToDecimal } from "../../utils/utils";

const createCheckoutBodySchema = z.object({
  stripe_price_id: z.string().min(1),
  plan_rank_tier: z.number().min(1),
});

// Create ephmeral key
async function createEphKey(clientSb: any) {
  return await stripe.ephemeralKeys.create(
    { customer: clientSb.stripe_customer_id },
    { apiVersion: "2023-10-16" },
  );
}

export async function createCheckoutController(req: Request, res: Response) {
  console.log("[CREATE CHECKOUT] - STARTED");
  try {
    const parsed = createCheckoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados Inválidos", issues: parsed.error.issues });
    }

    const { stripe_price_id: chosenPlanPriceId, plan_rank_tier: chosenPlanRankTier } = parsed.data;

    const auth = await getAuthContext(req);
    const { sb } = auth;

    const { data: clientSb } = await sb
      .from("clients")
      .select("*")
      .eq("user_id", auth.userId)
      .single()
      .throwOnError();

    // If the client is upgrading for the first time
    if (!clientSb.subscription_id) {
      console.log("[CREATE CHECKOUT] - CASE: Client is upgrading for the first time");
      // Create stripe subscription
      const subscription = await stripe.subscriptions.create({
        customer: clientSb.stripe_customer_id,
        items: [{ price: chosenPlanPriceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
      });

      // Create ephemeral key
      const ephKey = await createEphKey(clientSb);

      const invoice: any = subscription.latest_invoice;
      const piSecret = invoice?.payment_intent?.client_secret;

      console.log("[CREATE CHECKOUT] - FINISHED");
      return res.json({
        customerId: clientSb.stripe_customer_id,
        clientId: clientSb.id,
        subscriptionId: subscription.id,
        paymentIntentClientSecret: piSecret,
        ephemeralKeySecret: ephKey.secret,
      });
    }

    // If the client is updating their existing subscription
    if (clientSb.subscription_id) {
      const { data: subscriptionSb } = await sb
        .from("stripe_subscriptions")
        .select("*")
        .eq("id", clientSb.subscription_id)
        .single()
        .throwOnError();

      const currentPlanRankTier = subscriptionSb.subscription_data.plan.metadata.rank_tier;

      // If the customer has an active subscription
      if (subscriptionSb.status === "active") {
        // If the customer is upgrading their plan
        if (chosenPlanRankTier > currentPlanRankTier) {
          console.log("[CREATE CHECKOUT] - CASE: Client is upgrading their existing subscription");

          // Updates subscription on stripe
          const subscription = await stripe.subscriptions.update(subscriptionSb.stripe_id, {
            items: [
              {
                id: subscriptionSb.subscription_item_id, // id do item antigo (si_…)
                price: chosenPlanPriceId, // novo plano
              },
            ],

            proration_behavior: "always_invoice",
            billing_cycle_anchor: "unchanged", // mantém ciclo
            payment_behavior: "pending_if_incomplete",
            expand: ["latest_invoice.payment_intent"],
          });

          // Create ephemeral key
          const ephKey = await createEphKey(clientSb);

          const invoice: any = subscription.latest_invoice;
          const piSecret = invoice?.payment_intent?.client_secret;

          console.log("[CREATE CHECKOUT] - FINISHED");
          return res.json({
            customerId: clientSb.stripe_customer_id,
            clientId: clientSb.id,
            subscriptionId: subscription.id,
            paymentIntentClientSecret: piSecret,
            ephemeralKeySecret: ephKey.secret,
          });
        }
        // If the customer is downgrading their plan
        if (chosenPlanRankTier < currentPlanRankTier) {
          console.log(
            "[CREATE CHECKOUT] - CASE: Client is downgrading their existing subscription",
          );
          console.log("[CREATE CHECKOUT] - FINISHED");
        }

        // If the customer selected the same plan
        if (chosenPlanRankTier == currentPlanRankTier) {
          console.log(
            "[CREATE CHECKOUT] - CASE: Client tried to go to checkout to their current plan",
          );
          console.log("[CREATE CHECKOUT] - FINISHED");
          return res.status(400).json({
            message: "Esse já é o seu plano atual.",
          });
        }
      }

      // If the customer has a past_due or unpaid subscription
      if (subscriptionSb.status === "unpaid" || subscriptionSb.status === "past_due") {
        console.log("[CREATE CHECKOUT] - CASE: Client has a past_due or unpaid subscription");
        console.log("[CREATE CHECKOUT] - FINISHED");

        return res.status(400).json({
          message:
            "Não é possível atualizar o plano enquanto houver pagamentos pendentes. Por favor, regularize o pagamento da sua assinatura.",
        });
      }

      // If the customer has a canceled subscription
      if (subscriptionSb.status === "canceled") {
        console.log("[CREATE CHECKOUT] - CASE: Client has a canceled subscription");
        console.log("[CREATE CHECKOUT] - FINISHED");
      }
    }
  } catch (err) {
    return res.status(500).json({ message: "Error", error: err });
  }
}
