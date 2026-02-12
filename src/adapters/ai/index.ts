import { createAnthropicClient } from "./anthropic";
import { createDeepseekClient } from "./deepseek";
import { createGeminiClient } from "./gemini";
import { createOpenAiClient } from "./openai";
import { AiClient, AiProvider, GenerateTextInput } from "./types/types";

function getAiClient(provider: AiProvider): AiClient {
    switch (provider) {
        case "openai":
            return createOpenAiClient();
        case "deepseek":
            return createDeepseekClient();
        case "gemini":
            return createGeminiClient();
        case "anthropic":
            return createAnthropicClient();
        default:
            return createOpenAiClient();
    }
}

export async function generateTextWithAi(input: GenerateTextInput) {
    const client = getAiClient(input.provider);
    return client.generateText({ transcription: input.transcription, prompt: input.prompt, model: input.model });
}
