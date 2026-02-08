import express from "express";
import { stripeWebhookController } from "../controllers/web/stripeWebhooks";

export const stripeWebhooks = express.Router();

stripeWebhooks.post("/", express.raw({ type: "application/json" }), stripeWebhookController);
