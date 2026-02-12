import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { clientRoutes } from "./client.routes";
import { plansRoutes } from "./plans.routes";
import { paymentsRoutes } from "./payment.routes";
import { documentsRoutes } from "./documents.routes";

export const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/client", clientRoutes);
routes.use("/plans", plansRoutes);
routes.use("/payments", paymentsRoutes);
routes.use("/documents", documentsRoutes);