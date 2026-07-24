import stripe from "../../lib/stripe";
import Stripe from "stripe";
import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";

const createCheckoutBodySchema = z.object({
  stripe_price_id: z.string().min(1),
  plan_rank_tier: z.number().min(1),
});

async function createEphKey(clientSb: any) {
  return await stripe.ephemeralKeys.create(
    { customer: clientSb.stripe_customer_id },
    { apiVersion: "2023-10-16" },
  );
}

export async function createCheckoutController(req: Request, res: Response) {
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

    if (!clientSb.subscription_id) {
      const [subscription, ephKey] = await Promise.all([
        await stripe.subscriptions.create({
          customer: clientSb.stripe_customer_id,
          items: [{ price: chosenPlanPriceId }],
          payment_behavior: "default_incomplete",
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
          metadata: {
            type: "subscription_first_upgrade",
            new_plan_rank_tier: String(chosenPlanRankTier),
            client_id: clientSb.id,
          },
        }),
        createEphKey(clientSb),
      ]);

      const invoice: any = subscription.latest_invoice;
      const piSecret = invoice?.payment_intent?.client_secret;

      return res.json({
        customerId: clientSb.stripe_customer_id,
        clientId: clientSb.id,
        subscriptionId: subscription.id,
        paymentIntentClientSecret: piSecret,
        ephemeralKeySecret: ephKey.secret,
      });
    }

    if (clientSb.subscription_id) {
      const { data: subscriptionSb } = await sb
        .from("stripe_subscriptions")
        .select("*")
        .eq("id", clientSb.subscription_id)
        .single()
        .throwOnError();

      const currentPlanRankTier = subscriptionSb.subscription_data.plan.metadata.rank_tier;
      const currentPlanPriceId = subscriptionSb.subscription_data.plan.id;

      if (subscriptionSb.status === "active") {
        if (chosenPlanRankTier > currentPlanRankTier) {

          const prorationDate = Math.floor(Date.now() / 1000);

          const upgradeMetadata = {
            type: "subscription_plan_upgrade",
            subscription_id: subscriptionSb.stripe_id,
            subscription_item_id: subscriptionSb.subscription_item_id,
            new_price_id: chosenPlanPriceId,
            old_price_id: subscriptionSb.subscription_data.plan.id,
            new_plan_rank_tier: String(chosenPlanRankTier),
            old_plan_rank_tier: String(currentPlanRankTier),
            client_id: clientSb.id,
            proration_date: String(prorationDate),
          };

          const [invoicePreview, invoice, ephKey] = await Promise.all([
            stripe.invoices.createPreview({
              customer: clientSb.stripe_customer_id,
              subscription: subscriptionSb.stripe_id,
              subscription_details: {
                items: [
                  {
                    id: subscriptionSb.subscription_item_id,
                    price: chosenPlanPriceId,
                  },
                ],
              },
            }),
            stripe.invoices.create({
              customer: clientSb.stripe_customer_id,
              collection_method: "send_invoice",
              days_until_due: 1,
              auto_advance: false,
              metadata: upgradeMetadata,
            }),
            createEphKey(clientSb),
          ]);

          const prorationLines = invoicePreview.lines.data.filter(
            (line) => (line as any).proration,
          );
          const prorationAmount = prorationLines.reduce((sum, line) => sum + line.amount, 0);

          await stripe.invoiceItems.create({
            customer: clientSb.stripe_customer_id,
            invoice: invoice.id,
            amount: prorationAmount,
            currency: invoicePreview.currency,
            description: `Upgrade de plano: [ATUAL] ${currentPlanPriceId} -> [UPGRADE] ${chosenPlanPriceId}`,
            metadata: upgradeMetadata,
          });

          const finalizedInvoice: any = await stripe.invoices.finalizeInvoice(invoice.id, {
            expand: ["payment_intent"],
          });

          const paymentIntent = finalizedInvoice.payment_intent as Stripe.PaymentIntent;

          return res.json({
            type: "upgrade_payment_required",
            customerId: clientSb.stripe_customer_id,
            clientId: clientSb.id,
            paymentIntentClientSecret: paymentIntent.client_secret,
            ephemeralKeySecret: ephKey.secret,
            upgrade: {
              amount: prorationAmount,
              currency: invoicePreview.currency,
              prorationDetails: prorationLines.map((line) => ({
                description: line.description,
                amount: line.amount,
              })),
            },
          });
        }
        if (chosenPlanRankTier < currentPlanRankTier) {
          return res.status(400).json({
            message: "Not built yet.",
          });
        }

        if (chosenPlanRankTier == currentPlanRankTier) {
          return res.status(400).json({
            message: "Esse já é o seu plano atual.",
          });
        }
      }

      if (subscriptionSb.status === "unpaid" || subscriptionSb.status === "past_due") {

        return res.status(400).json({
          message:
            "Não é possível atualizar o plano enquanto houver pagamentos pendentes. Por favor, regularize o pagamento da sua assinatura.",
        });
      }

      if (subscriptionSb.status === "canceled") {

        return res.status(400).json({
          message: "Not built yet.",
        });
      }

      return res
        .status(500)
        .json({ message: "Por favor, entre em contato com o nosso time de suporte." });
    }
  } catch (err) {
    return res.status(500).json({ message: "Error", error: err });
  }
}
