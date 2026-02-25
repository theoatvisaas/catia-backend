import * as fs from "fs/promises";
import { supabaseAdmin } from "../../lib/supabase";
import { PIPELINE_CONFIG } from "../../config/pipeline";

export async function uploadFullAudio(
    localPath: string,
    bucket: string,
    prefix: string,
): Promise<string> {
    const tag = "[UPLOAD FULL AUDIO]";
    const storagePath = `${prefix}/${PIPELINE_CONFIG.storage.fullAudioFilename}`;

    console.log(`${tag} Starting — local: ${localPath}, destination: ${bucket}/${storagePath}`);

    const fileBuffer = await fs.readFile(localPath);
    console.log(`${tag} File read — ${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    console.log(`${tag} Uploading to Supabase Storage...`);
    const { error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, fileBuffer, {
            contentType: "audio/wav",
            upsert: true,
        });

    if (error) {
        throw new Error(`Failed to upload full audio to ${bucket}/${storagePath}: ${error.message}`);
    }

    console.log(`${tag} Complete — uploaded to ${bucket}/${storagePath}`);
    return storagePath;
}
