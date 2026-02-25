// src/adapters/ai/openai.ts

import { AiClient } from "./types/types";

export function createOpenAiClient(): AiClient {
    return {
        async generateText({ transcription, prompt, model }) {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

            const res = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: model,
                    max_output_tokens: 4096,
                    input: [
                        {
                            role: "user",
                            content: [
                                { type: "input_text", text: prompt },
                                { type: "input_text", text: transcription },
                            ],
                        },
                    ],
                }),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => "");
                const e: any = new Error("OpenAI request failed");
                e.status = res.status;
                e.provider = "openai";
                e.body = errText;
                throw e;
            }

            const json: any = await res.json();
            const text =
                json?.output_text ??
                json?.output?.[0]?.content?.map((c: any) => c?.text).filter(Boolean).join("\n") ??
                "";

            if (!text) {
                const e: any = new Error("OpenAI retornou resposta vazia");
                e.provider = "openai";
                throw e;
            }

            return text;
        },
    };
}
