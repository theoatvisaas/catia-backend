import * as fs from "fs/promises";
import * as path from "path";
import { PIPELINE_CONFIG } from "../../config/pipeline";

const WAV_HEADER_SIZE = 44;

export async function concatenateAudio(
    chunkPaths: string[],
    tempDir: string,
): Promise<string> {
    const tag = "[CONCATENATE AUDIO]";
    const outputPath = path.join(tempDir, PIPELINE_CONFIG.storage.fullAudioFilename);

    console.log(`${tag} Starting — ${chunkPaths.length} chunks to concatenate`);
    console.log(`${tag} Output path: ${outputPath}`);

    if (chunkPaths.length === 0) {
        throw new Error("No chunks to concatenate");
    }

    if (chunkPaths.length === 1) {
        console.log(`${tag} Single chunk — copying directly`);
        await fs.copyFile(chunkPaths[0], outputPath);
        const stats = await fs.stat(outputPath);
        console.log(`${tag} Complete — single chunk copied (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
        return outputPath;
    }

    // Binary WAV concatenation:
    // 1. Read header from first chunk (44 bytes) to get audio format info
    // 2. Calculate total PCM data size (sum of all chunks minus their headers)
    // 3. Write new header with corrected size + all PCM data

    console.log(`${tag} Reading header from first chunk...`);
    const firstChunkBuffer = await fs.readFile(chunkPaths[0]);

    if (firstChunkBuffer.length < WAV_HEADER_SIZE) {
        throw new Error(`First chunk is too small (${firstChunkBuffer.length} bytes) — expected at least ${WAV_HEADER_SIZE} bytes`);
    }

    // Validate RIFF header
    const riffTag = firstChunkBuffer.toString("ascii", 0, 4);
    const waveTag = firstChunkBuffer.toString("ascii", 8, 12);
    if (riffTag !== "RIFF" || waveTag !== "WAVE") {
        throw new Error(`Invalid WAV header — RIFF: "${riffTag}", WAVE: "${waveTag}"`);
    }
    console.log(`${tag} WAV header validated — RIFF/WAVE format confirmed`);

    // Read audio properties from header for logging
    const channels = firstChunkBuffer.readUInt16LE(22);
    const sampleRate = firstChunkBuffer.readUInt32LE(24);
    const bitsPerSample = firstChunkBuffer.readUInt16LE(34);
    console.log(`${tag} Audio format — channels: ${channels}, sample_rate: ${sampleRate}, bits_per_sample: ${bitsPerSample}`);

    // Calculate total PCM data size
    console.log(`${tag} Calculating total PCM data size...`);
    let totalPcmSize = 0;
    const chunkSizes: number[] = [];

    for (const chunkPath of chunkPaths) {
        const stats = await fs.stat(chunkPath);
        const pcmSize = stats.size - WAV_HEADER_SIZE;
        if (pcmSize < 0) {
            console.warn(`${tag} Chunk ${path.basename(chunkPath)} is smaller than header (${stats.size} bytes) — skipping`);
            continue;
        }
        chunkSizes.push(pcmSize);
        totalPcmSize += pcmSize;
    }
    console.log(`${tag} Total PCM data: ${(totalPcmSize / 1024 / 1024).toFixed(1)} MB (${chunkSizes.length} valid chunks)`);

    if (chunkSizes.length === 0) {
        throw new Error("No valid audio chunks — all chunks were smaller than WAV header size");
    }

    // Build new WAV header with corrected sizes
    const newHeader = Buffer.alloc(WAV_HEADER_SIZE);
    firstChunkBuffer.copy(newHeader, 0, 0, WAV_HEADER_SIZE);

    // Update RIFF chunk size (file size - 8)
    newHeader.writeUInt32LE(totalPcmSize + WAV_HEADER_SIZE - 8, 4);

    // Update data chunk size
    // Find "data" sub-chunk — it's typically at offset 36, but let's be safe
    let dataChunkOffset = 36;
    const fmtTag = newHeader.toString("ascii", 36, 40);
    if (fmtTag === "data") {
        dataChunkOffset = 36;
    } else {
        console.warn(`${tag} Expected "data" sub-chunk at offset 36, found "${fmtTag}" — header may be incorrect`);
    }
    newHeader.writeUInt32LE(totalPcmSize, dataChunkOffset + 4);
    console.log(`${tag} New WAV header built — total file size: ${(totalPcmSize + WAV_HEADER_SIZE) / 1024 / 1024} MB`);

    // Write output file incrementally
    console.log(`${tag} Writing concatenated file...`);
    const fileHandle = await fs.open(outputPath, "w");
    try {
        // Write header
        await fileHandle.write(newHeader, 0, WAV_HEADER_SIZE, 0);
        let writeOffset = WAV_HEADER_SIZE;

        for (let i = 0; i < chunkPaths.length; i++) {
            const chunkBuffer = await fs.readFile(chunkPaths[i]);
            if (chunkBuffer.length <= WAV_HEADER_SIZE) {
                console.warn(`${tag} Skipping chunk ${i} — too small`);
                continue;
            }

            // Write only PCM data (skip header)
            const pcmData = chunkBuffer.subarray(WAV_HEADER_SIZE);
            await fileHandle.write(pcmData, 0, pcmData.length, writeOffset);
            writeOffset += pcmData.length;

            if ((i + 1) % 20 === 0 || i === chunkPaths.length - 1) {
                console.log(`${tag} Write progress: ${i + 1}/${chunkPaths.length} chunks (${(writeOffset / 1024 / 1024).toFixed(1)} MB written)`);
            }
        }
    } finally {
        await fileHandle.close();
    }

    const finalStats = await fs.stat(outputPath);
    console.log(`${tag} Complete — output: ${outputPath} (${(finalStats.size / 1024 / 1024).toFixed(1)} MB)`);
    return outputPath;
}
