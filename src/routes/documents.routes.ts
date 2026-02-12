import { Router } from 'express';

import { requireAuth } from "../middlewares/requireAuth";
import { documentsController } from '../controllers/documents/documentsController';

export const documentsRoutes = Router();

documentsRoutes.post("/", requireAuth, documentsController)