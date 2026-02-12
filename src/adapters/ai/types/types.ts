export type AiProvider = "openai" | "deepseek" | "gemini" | "anthropic";
export type AiModel = "gpt-4o-mini" | "deepseek" | "gemini-pro-1_5" | "claude"

export type GenerateTextInput = {
    provider: AiProvider;
    transcription: string;
    prompt: string;
    model: AiModel;
};

export type AiClient = {
    generateText(input: Omit<GenerateTextInput, "provider">): Promise<string>;
};
