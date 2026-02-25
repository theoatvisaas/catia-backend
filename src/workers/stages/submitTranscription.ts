import { supabaseAdmin } from "../../lib/supabase";
import { submitTranscriptionToAssemblyAI } from "../../adapters/assemblyai";

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour — AssemblyAI may take time to download

export async function submitTranscription(
    bucket: string,
    fullAudioPath: string,
    jobId: string,
): Promise<string> {
    const tag = `[SUBMIT TRANSCRIPTION ${jobId}]`;

    // 1. Create signed URL for AssemblyAI to download the audio
    console.log(`${tag} Creating signed URL — bucket: ${bucket}, path: ${fullAudioPath}, expiry: ${SIGNED_URL_EXPIRY_SECONDS}s`);

    const { data: signedData, error: signError } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(fullAudioPath, SIGNED_URL_EXPIRY_SECONDS);

    if (signError || !signedData?.signedUrl) {
        throw new Error(`Failed to create signed URL for ${fullAudioPath}: ${signError?.message}`);
    }
    console.log(`${tag} Signed URL created — expires in ${SIGNED_URL_EXPIRY_SECONDS}s`);

    // 2. Submit to AssemblyAI
    console.log(`${tag} Submitting to AssemblyAI...`);
    const { transcriptId } = await submitTranscriptionToAssemblyAI(signedData.signedUrl);

    console.log(`${tag} Complete — transcript_id: ${transcriptId}`);
    return transcriptId;
}
