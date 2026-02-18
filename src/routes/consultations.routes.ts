import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import { consultationsGetController, consultationsUpdateController } from "../controllers/consultations/consultationsController";


export const consultationsRoutes = Router();

consultationsRoutes.get("/:id", requireAuth, consultationsGetController);

consultationsRoutes.put("/:id", requireAuth, consultationsUpdateController);
