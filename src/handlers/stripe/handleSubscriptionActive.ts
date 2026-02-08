import Stripe from "stripe";
import { supabaseAdmin } from "../../lib/supabase";

export async function handleSubscriptionActive(invoice: Stripe.Subscription) {
  const customerId = invoice.customer as string | null;

  if (!customerId) {
    console.error("Invoice sem customerId", invoice.id);
    return;
  }

  const { data: client, error: findError } = await supabaseAdmin
    .from("clients")
    .select("id,status,funnel_phase,user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (findError) {
    console.error("Erro ao buscar cliente:", findError);
    return;
  }

  if (!client) {
    console.error("Cliente não encontrado para customer:", customerId);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("clients")
    .update({
      status: true,
      funnel_phase: "active",
    })
    .eq("id", client.id);

  if (updateError) {
    console.error("Erro ao ativar cliente:", updateError);
    return;
  }

  console.log("Cliente ativado com sucesso", {
    clientId: client.id,
    customerId,
    invoiceId: invoice.id,
  });
}
