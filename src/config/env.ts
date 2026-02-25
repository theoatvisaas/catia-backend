import dotenv from "dotenv";

dotenv.config();

const pipelineEnvVars = [
    "ASSEMBLYAI_API_KEY",
    "ASSEMBLYAI_WEBHOOK_AUTH_TOKEN",
    "RAILWAY_PUBLIC_DOMAIN",
] as const;

for (const name of pipelineEnvVars) {
    if (!process.env[name]) {
        console.warn(`[ENV] Warning: ${name} is not set`);
    }
}
