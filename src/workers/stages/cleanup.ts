import * as fs from "fs/promises";
import { supabaseAdmin } from "../../lib/supabase";
import { PIPELINE_CONFIG } from "../../config/pipeline";

export async function cleanupTempFiles(tempDir: string): Promise<void> {
    const tag = "[CLEANUP TEMP]";
    console.log(`${tag} Removing temp directory: ${tempDir}`);

    try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`${tag} Complete — temp directory removed`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`${tag} Warning — failed to remove temp dir: ${message}`);
    }
}

export async function deleteStorageChunks(
    bucket: string,
    prefix: string,
    chunkCount: number,
): Promise<void> {
    const tag = "[CLEANUP STORAGE]";
    console.log(`${tag} Starting — bucket: ${bucket}, prefix: ${prefix}, expected chunks: ${chunkCount}`);

    // List all files in the prefix
    console.log(`${tag} Listing files in storage...`);
    const { data: files, error: listError } = await supabaseAdmin.storage
        .from(bucket)
        .list(prefix, { limit: chunkCount + 10 });

    if (listError || !files) {
        throw new Error(`Failed to list chunks for deletion: ${listError?.message}`);
    }
    console.log(`${tag} Found ${files.length} files in storage`);

    // Delete everything EXCEPT the full audio file
    const toDelete = files
        .filter((f) => f.name !== PIPELINE_CONFIG.storage.fullAudioFilename)
        .map((f) => `${prefix}/${f.name}`);

    if (toDelete.length === 0) {
        console.log(`${tag} No chunks to delete — skipping`);
        return;
    }

    console.log(`${tag} Deleting ${toDelete.length} chunk files (preserving ${PIPELINE_CONFIG.storage.fullAudioFilename})...`);

    const { error: deleteError } = await supabaseAdmin.storage
        .from(bucket)
        .remove(toDelete);

    if (deleteError) {
        throw new Error(`Failed to delete chunks: ${deleteError.message}`);
    }

    console.log(`${tag} Complete — deleted ${toDelete.length} chunks from ${bucket}/${prefix}`);
}
