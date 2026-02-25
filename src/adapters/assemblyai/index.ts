import { AssemblyAI, Transcript } from "assemblyai";

let client: AssemblyAI | null = null;

function getClient(): AssemblyAI {
    if (!client) {
        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY não configurada");

        client = new AssemblyAI({ apiKey });
        console.log("[ASSEMBLYAI] Client initialized");
    }
    return client;
}

function buildWebhookUrl(): string {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (!domain) throw new Error("RAILWAY_PUBLIC_DOMAIN não configurada — necessária para webhook AssemblyAI");

    const token = process.env.ASSEMBLYAI_WEBHOOK_AUTH_TOKEN;
    if (!token) throw new Error("ASSEMBLYAI_WEBHOOK_AUTH_TOKEN não configurada");

    const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    return `${baseUrl}/assemblyai-webhook?token=${encodeURIComponent(token)}`;
}

export async function submitTranscriptionToAssemblyAI(audioUrl: string): Promise<{ transcriptId: string }> {
    const tag = "[ASSEMBLYAI SUBMIT]";
    const aaiClient = getClient();
    const webhookUrl = buildWebhookUrl();

    console.log(`${tag} Submitting transcription...`);
    console.log(`${tag} audio_url: ${audioUrl.substring(0, 80)}...`);
    console.log(`${tag} webhook_url: ${webhookUrl.replace(/token=[^&]+/, "token=***")}`);
    console.log(`${tag} language_code: pt`);

    const transcript: Transcript = await aaiClient.transcripts.submit({
        audio_url: audioUrl,
        language_code: "pt",
        webhook_url: webhookUrl,
    });

    if (!transcript.id) {
        throw new Error("AssemblyAI returned no transcript id");
    }

    console.log(`${tag} Submitted successfully — transcript_id: ${transcript.id}, status: ${transcript.status}`);
    return { transcriptId: transcript.id };
}

export async function getTranscriptFromAssemblyAI(transcriptId: string): Promise<Transcript> {
    const tag = "[ASSEMBLYAI GET]";
    const aaiClient = getClient();

    console.log(`${tag} Fetching transcript — id: ${transcriptId}`);
    const transcript = await aaiClient.transcripts.get(transcriptId);

    console.log(`${tag} Transcript fetched — status: ${transcript.status}, text_length: ${transcript.text?.length ?? 0}`);
    return transcript;
}
