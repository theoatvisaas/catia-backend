import Stripe from "stripe";
import { supabaseAdmin } from "../../lib/supabase";
import { toISO } from "../../utils/utils";

export async function handleSubscribingForTheFirstTime(subscription: Stripe.Subscription) {
  console.log("[STRIPE WEBHOOK] - STARTING - handleSubscribingForTheFirstTime");
  const customerId = subscription.customer as string | null;
  const plan = subscription.items.data[0].plan;

  const { data: clientSb } = await supabaseAdmin
    .from("clients")
    .select("id,status,funnel_phase,user_id")
    .eq("stripe_customer_id", customerId)
    .single()
    .throwOnError();

  await supabaseAdmin
    .from("stripe_subscriptions")
    .insert({
      stripe_id: subscription.id,
      client_id: clientSb.id,
      status: subscription.status,
      customer: subscription.customer,
      days_until_due: subscription.days_until_due,
      default_payment_method: subscription.default_payment_method,
      latest_invoice: subscription.latest_invoice,
      plan_id: plan.id,
      plan_active: plan.active,
      plan_amount: plan.amount,
      plan_product: plan.product,
      start_date: toISO(subscription.start_date),
      subscription_data: subscription,
      subscription_item_id: subscription.items.data[0].id,
      first_active_at: toISO(subscription.created),
      last_active_at: toISO(subscription.created),
    })
    .throwOnError();

  await supabaseAdmin
    .from("clients")
    .update({
      status: true,
      funnel_phase: "active",
    })
    .eq("id", clientSb.id)
    .throwOnError();

  console.log("Cliente ativado com sucesso", {
    clientId: clientSb.id,
    subscriptionId: subscription.id,
  });

  console.log("[STRIPE WEBHOOK] - FINISHED - handleSubscribingForTheFirstTime");
}
