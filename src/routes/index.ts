import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { clientRoutes } from "./client.routes";
import { plansRoutes } from "./plans.routes";

export const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/client", clientRoutes);
routes.use("/plans", plansRoutes);
