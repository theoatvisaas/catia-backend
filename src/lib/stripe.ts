import Stripe from "stripe";

export default new Stripe(process.env.STRIPE_SECRET!, { apiVersion: "2023-10-16" as any });
