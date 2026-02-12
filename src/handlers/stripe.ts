import Stripe from "stripe";
import stripe from "../lib/stripe";
import { supabaseAdmin } from "../lib/supabase";
import { toISO, stripeAmountToDecimal } from "../utils/utils";

export default {
  upgradingFirstTime,
  upgradingPlan,
};

async function addInvoiceToSupabase(
  invoice: Stripe.Invoice,
  subscriptionSb: any,
  client_id: string,
) {
  // add invoice to database
  await supabaseAdmin
    .from("stripe_invoices")
    .insert({
      subscription_id: subscriptionSb.id,
      client_id: client_id,
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
}

async function upgradingFirstTime(invoice: Stripe.Invoice) {
  console.log("[STRIPE WEBHOOK HANDLER] - CASE: UPGRADING FIRST TIME");

  const meta = invoice.metadata as any;

  const subcriptionId = invoice.parent?.subscription_details?.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subcriptionId);
  const plan = subscription.items.data[0].plan;

  // add subscription to supabase
  const { data: subscriptionSb } = await supabaseAdmin
    .from("stripe_subscriptions")
    .insert({
      stripe_id: subscription.id,
      client_id: meta.client_id,
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

  await addInvoiceToSupabase(invoice, subscriptionSb, meta.client_id);

  // activate client
  await supabaseAdmin
    .from("clients")
    .update({
      status: true,
      funnel_phase: "active",
      subscription_id: subscriptionSb.id,
    })
    .eq("id", meta.client_id)
    .throwOnError();

  console.log("[STRIPE WEBHOOK HANDLER] - CASE: UPGRADING FIRST TIME - SUCCESS", {
    clientId: meta.client_id,
    subscriptionId: subscription.id,
  });

  console.log("[STRIPE WEBHOOK HANDLER] - CASE: UPGRADING FIRST TIME - FINISHED");
}

async function upgradingPlan(invoice: Stripe.Invoice) {
  console.log("[STRIPE WEBHOOK HANDLER] - CASE: UPGRADING FIRST TIME");

  const meta = invoice.metadata as any;

  // updates subscription on stripe
  const updatedSubscription = await stripe.subscriptions.update(meta.subscription_id, {
    items: [
      {
        id: meta.subscription_item_id,
        price: meta.new_price_id,
      },
    ],
    proration_behavior: "none",
  });

  const plan = updatedSubscription.items.data[0].plan;

  // adds invoice on supabase
  await addInvoiceToSupabase(invoice, updatedSubscription, invoice.metadata!.client_id);

  // updates subscription to supabase
  await supabaseAdmin
    .from("stripe_subscriptions")
    .update({
      status: updatedSubscription.status,
      default_payment_method: updatedSubscription.default_payment_method,
      latest_invoice: updatedSubscription.latest_invoice,
      stripe_price_id: plan.id,
      plan_active: plan.active,
      plan_amount: stripeAmountToDecimal(plan.amount),
      plan_product: plan.product,
      subscription_data: updatedSubscription,
      subscription_item_id: updatedSubscription.items.data[0].id,
      rank_tier: plan.metadata!.rank_tier,
    })
    .eq("id", meta.subscription_id)
    .select("id")
    .single()
    .throwOnError();

  // activate client
  await supabaseAdmin
    .from("clients")
    .update({
      status: true,
      funnel_phase: "active",
      subscription_id: updatedSubscription.id,
    })
    .eq("id", invoice.metadata!.client_id)
    .throwOnError();

  console.log("[STRIPE WEBHOOK HANDLER] - CASE: UPGRADING PLAN - SUCCESS", {
    clientId: meta.client_id,
    subscriptionId: updatedSubscription.id,
  });

  console.log("[STRIPE WEBHOOK HANDLER] - CASE: UPGRADING PLAN - FINISHED");
}
