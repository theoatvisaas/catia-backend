export const PIPELINE_CONFIG = {
    timeouts: {
        chunkDownloadMs: 30_000,
        concatenationMs: 120_000,
        transcriptionSubmitMs: 30_000,
        docGenerationPerTypeMs: 60_000,
        totalPreWebhookMs: 600_000,
    },
    storage: {
        fullAudioFilename: "full.wav",
        tempDir: "/tmp/catia-pipeline",
    },
} as const;
