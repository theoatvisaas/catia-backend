import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import { assemblyAiWebhookController } from "../controllers/consultations/assemblyAiWebhookController";

export const assemblyAiWebhooks = Router();

assemblyAiWebhooks.use(express.json({ limit: Infinity }));
assemblyAiWebhooks.post("/", assemblyAiWebhookController);

// Error handler for JSON parse failures (malformed body from AssemblyAI)
assemblyAiWebhooks.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[ASSEMBLYAI WEBHOOK] JSON parse error:", err.message);
    res.status(400).json({ message: "Invalid JSON" });
});
