import { AiClient } from "./types/types";


export function createGeminiClient(): AiClient {
    return {
        async generateText({ transcription, prompt, model }) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
            
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: `${prompt}\n\n${transcription}` }],
                        },
                    ],
                }),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => "");
                const e: any = new Error("Gemini request failed");
                e.status = res.status;
                e.provider = "gemini";
                e.body = errText;
                throw e;
            }

            const json: any = await res.json();
            const text =
                json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ?? "";

            if (!text) {
                const e: any = new Error("Gemini retornou resposta vazia");
                e.provider = "gemini";
                throw e;
            }

            return text;
        },
    };
}
