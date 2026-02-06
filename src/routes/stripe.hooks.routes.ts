import express from "express";
import { stripeWebHookController } from "../controllers/web/stripeWebHook";

export const stripeWebHooks = express.Router();

stripeWebHooks.post(
  "/",
  express.raw({ type: "application/json" }),
  stripeWebHookController
);
