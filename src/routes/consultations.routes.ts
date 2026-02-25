import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { finishConsultationController } from "../controllers/consultations/finishConsultationController";
import { getJobStatusController } from "../controllers/consultations/getJobStatusController";

export const consultationsRoutes = Router();

consultationsRoutes.post("/:session_id/finish", requireAuth, finishConsultationController);
consultationsRoutes.get("/jobs/:job_id", requireAuth, getJobStatusController);
