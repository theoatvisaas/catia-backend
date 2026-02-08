import { Router } from "express";

import {
  getClientByIdController,
  updateClientByIdController,
} from "../controllers/client/clientController";
import { requireAuth } from "../middlewares/requireAuth";

export const clientRoutes = Router();

clientRoutes.get("/", requireAuth, getClientByIdController);
clientRoutes.put("/:id", requireAuth, updateClientByIdController);
