import { Router } from "express";

import {listPlansController} from "../controllers/billing/plansController";

export const plansRoutes = Router();

plansRoutes.get("/", listPlansController);
