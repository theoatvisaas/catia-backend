import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import {
  documentsCreateController,
  documentsUploadController,
  documentsGetAllController,
  documentsGetController,
  documentsUpdateController,
  documentsGetByConsultationIdController,
} from "../controllers/documents/documentsController";

export const documentsRoutes = Router();

documentsRoutes.post("/", requireAuth, documentsCreateController);
documentsRoutes.get("/", requireAuth, documentsGetAllController);
//documentsRoutes.get("/:id", requireAuth, documentsGetController);
documentsRoutes.get("/:id", requireAuth, documentsGetByConsultationIdController);
documentsRoutes.patch("/:id", requireAuth, documentsUpdateController);
