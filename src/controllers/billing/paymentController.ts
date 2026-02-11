import stripe from "../../lib/stripe";
import Stripe from "stripe";
import { Request, Response } from "express";
import { z } from "zod";
import { getAuthContext } from "../../utils/auth";

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
      console.log("[CREATE CHECKOUT] - CASE: UPGRADING FIRST TIME");

      // Etapa 1: três chamadas independentes em paralelo
      const [subscription, ephKey] = await Promise.all([
        // Create stripe subscription
        await stripe.subscriptions.create({
          customer: clientSb.stripe_customer_id,
          items: [{ price: chosenPlanPriceId }],
          payment_behavior: "default_incomplete",
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
          // Metadata para o webhook saber o que fazer quando o pagamento for confirmado
          metadata: {
            type: "subscription_first_upgrade",
            new_plan_rank_tier: String(chosenPlanRankTier),
            client_id: clientSb.id,
          },
        }),
        // Ephemeral key (independente de tudo)
        createEphKey(clientSb),
      ]);

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
      const currentPlanPriceId = subscriptionSb.subscription_data.plan.id;

      // If the customer has an active subscription
      if (subscriptionSb.status === "active") {
        // If the customer is upgrading their plan
        if (chosenPlanRankTier > currentPlanRankTier) {
          console.log("[CREATE CHECKOUT] - CASE: UPGRADING PLAN");

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

          // Etapa 1: três chamadas independentes em paralelo
          const [invoicePreview, invoice, ephKey] = await Promise.all([
            // Preview da proration
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
            // Invoice draft (não precisa do preview para ser criada)
            stripe.invoices.create({
              customer: clientSb.stripe_customer_id,
              collection_method: "send_invoice",
              days_until_due: 1,
              auto_advance: false,
              metadata: upgradeMetadata,
            }),
            // Ephemeral key (independente de tudo)
            createEphKey(clientSb),
          ]);

          // Filtrar linhas de proration
          const prorationLines = invoicePreview.lines.data.filter(
            (line) => (line as any).proration,
          );
          const prorationAmount = prorationLines.reduce((sum, line) => sum + line.amount, 0);

          // Etapa 2: criar item vinculado à invoice (precisa de invoice.id + prorationAmount)
          await stripe.invoiceItems.create({
            customer: clientSb.stripe_customer_id,
            invoice: invoice.id,
            amount: prorationAmount,
            currency: invoicePreview.currency,
            description: `Upgrade de plano: [ATUAL] ${currentPlanPriceId} -> [UPGRADE] ${chosenPlanPriceId}`,
            metadata: upgradeMetadata,
          });

          // Etapa 3: finalizar invoice → gera o PaymentIntent
          const finalizedInvoice: any = await stripe.invoices.finalizeInvoice(invoice.id, {
            expand: ["payment_intent"],
          });

          if (
            !finalizedInvoice.payment_intent ||
            typeof finalizedInvoice.payment_intent === "string"
          ) {
            console.error(
              "No payment_intent on finalized invoice, status:",
              finalizedInvoice.status,
            );
          }

          const paymentIntent = finalizedInvoice.payment_intent as Stripe.PaymentIntent;

          console.log("[CREATE CHECKOUT] - FINISHED (upgrade payment required)");
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
        // If the customer is downgrading their plan
        if (chosenPlanRankTier < currentPlanRankTier) {
          console.log("[CREATE CHECKOUT] - CASE: DOWNGRADING PLAN");
          console.log("[CREATE CHECKOUT] - FINISHED");
          return res.status(400).json({
            message: "Not built yet.",
          });
        }

        // If the customer selected the same plan
        if (chosenPlanRankTier == currentPlanRankTier) {
          console.log("[CREATE CHECKOUT] - CASE: SAME PLAN SELECTED");
          console.log("[CREATE CHECKOUT] - FINISHED");
          return res.status(400).json({
            message: "Esse já é o seu plano atual.",
          });
        }
      }

      // If the customer has a past_due or unpaid subscription
      if (subscriptionSb.status === "unpaid" || subscriptionSb.status === "past_due") {
        console.log("[CREATE CHECKOUT] - CASE: UNPAID OR PAST_DUE SUBSCRIPTION");
        console.log("[CREATE CHECKOUT] - FINISHED");

        return res.status(400).json({
          message:
            "Não é possível atualizar o plano enquanto houver pagamentos pendentes. Por favor, regularize o pagamento da sua assinatura.",
        });
      }

      // If the customer has a canceled subscription
      if (subscriptionSb.status === "canceled") {
        console.log("[CREATE CHECKOUT] - CASE: CANCELED SUBSCRIPTION");
        console.log("[CREATE CHECKOUT] - FINISHED");

        return res.status(400).json({
          message: "Not built yet.",
        });
      }

      console.log("[CREATE CHECKOUT]: INVALID USE CASE REACHED");
      return res
        .status(500)
        .json({ message: "Por favor, entre em contato com o nosso time de suporte." });
    }
  } catch (err) {
    console.log("ERROR: ", err);
    return res.status(500).json({ message: "Error", error: err });
  }
}
