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
  client_id: