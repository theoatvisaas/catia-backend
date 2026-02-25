import { AiClient } from "./types/types";


export function createAnthropicClient(): AiClient {
    return {
        async generateText({ transcription, prompt, model }) {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 4096,
                    messages: [
                        {
                            role: "user",
                            content: `${prompt}\n\n${transcription}`,
                        },
                    ],
                }),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => "");
                const e: any = new Error("Anthropic request failed");
                e.status = res.status;
                e.provider = "anthropic";
                e.body = errText;
                throw e;
            }

            const json: any = await res.json();
            const text = json?.content?.map((c: any) => c?.text).filter(Boolean).join("\n") ?? "";

            if (!text) {
                const e: any = new Error("Anthropic retornou resposta vazia");
                e.provider = "anthropic";
                throw e;
            }

            return text;
        },
    };
}
