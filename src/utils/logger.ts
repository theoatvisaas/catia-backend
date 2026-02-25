export function createPipelineLogger(jobId: string) {
    const prefix = `[PIPELINE ${jobId}]`;

    return {
        info(stage: string, message: string, meta?: Record<string, unknown>) {
            console.log(`${prefix} [${stage}] ${message}`, meta ? JSON.stringify(meta) : "");
        },
        warn(stage: string, message: string, meta?: Record<string, unknown>) {
            console.warn(`${prefix} [${stage}] ${message}`, meta ? JSON.stringify(meta) : "");
        },
        error(stage: string, message: string, err?: unknown, meta?: Record<string, unknown>) {
            const errMsg = err instanceof Error ? err.message : err ? String(err) : "";
            console.error(`${prefix} [${stage}] ${message}`, errMsg, meta ? JSON.stringify(meta) : "");
        },
        separator(title: string) {
            console.log(`${prefix} ======== ${title} ========`);
        },
        stage(name: string) {
            console.log(`${prefix} ---- ${name} ----`);
        },
    };
}
