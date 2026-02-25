export type AiProvider = "openai" | "deepseek" | "gemini" | "anthropic";
export type AiModel = string;

export type GenerateTextInput = {
    provider: AiProvider;
    transcription: string;
    prompt: string;
    model: AiModel;
};

export type AiClient = {
    generateText(input: Omit<GenerateTextInput, "provider">): Promise<string>;
};
