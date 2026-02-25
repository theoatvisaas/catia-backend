import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../../lib/supabase";
import { PIPELINE_CONFIG } from "../../config/pipeline";

export interface DownloadResult {
    chunkPaths: string[];
    tempDirPath: string;
}

export async function downloadChunks(
    bucket: string,
    prefix: string,
    chunkCount: number,
): Promise<DownloadResult> {
    const tag = "[DOWNLOAD CHUNKS]";
    const tempDir = path.join(PIPELINE_CONFIG.storage.tempDir, randomUUID());

    console.log(`${tag} Starting — bucket: ${bucket}, prefix: ${prefix}, expected chunks: ${chunkCount}`);
    console.log(`${tag} Temp directory: ${tempDir}`);

    await fs.mkdir(tempDir, { recursive: true });
    console.log(`${tag} Temp directory created`);

    // List files in storage prefix
    console.log(`${tag} Listing files in storage...`);
    const { data: files, error: listError } = await supabaseAdmin.storage
        .from(bucket)
        .list(prefix, { limit: chunkCount + 10, sortBy: { column: "name", order: "asc" } });

    if (listError || !files || files.length === 0) {
        throw new Error(`No chunks found in ${bucket}/${prefix}: ${listError?.message}`);
    }

    // Filter out full.wav if it exists from a previous run
    const chunkFiles = files.filter(
        (f) => f.name !== PIPELINE_CONFIG.storage.fullAudioFilename,
    );
    console.log(`${tag} Found ${files.length} files in storage, ${chunkFiles.length} are chunks`);

    if (chunkFiles.length !== chunkCount) {
        console.warn(`${tag} Chunk count mismatch — expected: ${chunkCount}, found: ${chunkFiles.length}`);
    }

    if (chunkFiles.length === 0) {
        throw new Error(`No audio chunks found in ${bucket}/${prefix} (all files filtered)`);
    }

    const chunkPaths: string[] = [];
    let totalBytes = 0;

    for (let i = 0; i < chunkFiles.length; i++) {
        const file = chunkFiles[i];
        const storagePath = `${prefix}/${file.name}`;

        console.log(`${tag} [${i + 1}/${chunkFiles.length}] Downloading: ${file.name} (${file.metadata?.size ?? "unknown"} bytes)`);

        // Download file directly
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from(bucket)
            .download(storagePath);

        if (downloadError || !fileData) {
            throw new Error(`Failed to download chunk ${storagePath}: ${downloadError?.message}`);
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const localPath = path.join(tempDir, file.name);
        await fs.writeFile(localPath, buffer);

        chunkPaths.push(localPath);
        totalBytes += buffer.length;

        if ((i + 1) % 10 === 0 || i === chunkFiles.length - 1) {
            console.log(`${tag} Progress: ${i + 1}/${chunkFiles.length} chunks downloaded (${(totalBytes / 1024 / 1024).toFixed(1)} MB total)`);
        }
    }

    console.log(`${tag} Complete — ${chunkPaths.length} chunks, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);
    return { chunkPaths, tempDirPath: tempDir };
}
