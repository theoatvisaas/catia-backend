import { AiClient } from "./types/types";

export function createDeepseekClient(): AiClient {
    return {
        async generateText({ transcription, prompt, model }) {
            const apiKey = process.env.DEEPSEEK_API_KEY;
            if (!apiKey) throw new Error("DEEPSEEK_API_KEY não configurada");

            const res = await fetch("https://api.deepseek.com/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: "system", content: "Você é um assistente útil." },
                        { role: "user", content: `${prompt}\n\n${transcription}` },
                    ],
                }),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => "");
                const e: any = new Error("DeepSeek request failed");
                e.status = res.status;
                e.provider = "deepseek";
                e.body = errText;
                throw e;
            }

            const json: any = await res.json();
            const text = json?.choices?.[0]?.message?.content ?? "";

            if (!text) {
                const e: any = new Error("DeepSeek retornou resposta vazia");
                e.provider = "deepseek";
                throw e;
            }

            return text;
        },
    };
}
