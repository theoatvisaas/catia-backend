import "./config/env";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { routes } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { notFound } from "./middlewares/notFound";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
    return res.status(200).json({ ok: true, service: "backend-node-ts", timestamp: new Date().toISOString() });
});

app.use(routes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 3333);

app.listen(port, () => {

    console.log(`🚀 Server running on http://localhost:${port}`);
});
