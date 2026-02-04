import { Router } from "express";

import {
  createClientController,
  getClientByIdController,
  updateClientByIdController,
} from "../controllers/client/clientController";
import { requireAuth } from "../middlewares/requireAuth";

export const clientRoutes = Router();

clientRoutes.post("/", requireAuth, createClientController);
clientRoutes.get("/", requireAuth, getClientByIdController);
clientRoutes.put("/:id", requireAuth, updateClientByIdController);