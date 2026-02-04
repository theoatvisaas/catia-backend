import { Router } from "express";

import {
  createCheckoutController
} from "../controllers/billing/paymentController";
import { requireAuth } from "../middlewares/requireAuth";

export const paymentsRoutes = Router();

paymentsRoutes.post("/", requireAuth, createCheckoutController);