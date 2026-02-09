import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase";
import { toISO, stripeAmountToDecimal } from "../utils/utils";

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: "2023-10-16" as any });

export async function handleSubscribingForTheFirstTime(subscription: Stripe.Subscription) {
  console.log("[STRIPE WEBHOOK] - STARTING - handleSubscribingForTheFirstTime");
  const customerId = subscription.customer as string;
  const plan = subscription.items.data[0].plan;

  // get customer from supabase
  const { data: clientSb } = await supabaseAdmin
    .from("clients")
    .select("id,status,funnel_phase,user_id")
    .eq("stripe_customer_id", customerId)
    .single()
    .throwOnError();

  // add subscription to supabase
  const { data: subscriptionSb } = await supabaseAdmin
    .from("stripe_subscriptions")
    .insert({
      stripe_id: subscription.id,
      client_id: clientSb.id,
      status: subscription.status,
      customer: subscription.customer,
      days_until_due: subscription.days_until_due,
      default_payment_method: subscription.default_payment_method,
      latest_invoice: subscription.latest_invoice,
      stripe_price_id: plan.id,
      plan_active: plan.active,
      plan_amount: stripeAmountToDecimal(plan.amount),
      plan_product: plan.product,
      start_date: toISO(subscription.start_date),
      subscription_data: subscription,
      subscription_item_id: subscription.items.data[0].id,
      first_active_at: toISO(subscription.created),
      last_active_at: toISO(subscription.created),
      rank_tier: plan.metadata!.rank_tier,
    })
    .select("id")
    .single()
    .throwOnError();

  // get invoice from stripe
  const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);

  // add invoice to database
  await supabaseAdmin
    .from("stripe_invoices")
    .insert({
      subscription_id: subscriptionSb.id,
      client_id: clientSb.id,
      stripe_id: invoice.id,
      amount_due: stripeAmountToDecimal(invoice.amount_due),
      amount_paid: stripeAmountToDecimal(invoice.amount_paid),
      created: toISO(invoice.created),
      customer: invoice.customer,
      confirmation_secret: invoice.confirmation_secret,
      default_payment_method: invoice.default_payment_method,
      due_date: toISO(invoice.due_date),
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      number: invoice.number,
      period_end: toISO(invoice.period_end),
      period_start: toISO(invoice.period_start),
      receipt_number: invoice.receipt_number,
      status: invoice.status,
      subtotal: stripeAmountToDecimal(invoice.subtotal),
      total: stripeAmountToDecimal(invoice.total),
      invoice_data: invoice,
    })
    .throwOnError();

  // activate client
  await supabaseAdmin
    .from("clients")
    .update({
      status: true,
      funnel_phase: "active",
      subscription_id: subscriptionSb.id,
    })
    .eq("id", clientSb.id)
    .throwOnError();

  console.log("Cliente ativado com sucesso", {
    clientId: clientSb.id,
    subscriptionId: subscription.id,
  });

  console.log("[STRIPE WEBHOOK] - FINISHED - handleSubscribingForTheFirstTime");
}
