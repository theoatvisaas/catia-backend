export type JobStatus =
    | "pending"
    | "downloading"
    | "concatenating"
    | "transcribing"
    | "generating_docs"
    | "completed"
    | "failed";

export interface Consultation {
    session_id: string;
    user_id: string;
    storage_bucket: string;
    storage_prefix: string;
    patient_name: string | null;
    guardian_name: string | null;
    sex: string | null;
    duration_ms: number | null;
    chunk_count: number;
    status: string;
    created_at: string;
    finalized_at: string | null;
    raw_transcript: string | null;
    full_audio_path: string | null;
}

export interface ConsultationJob {
    id: string;
    session_id: string;
    user_id: string;
    status: JobStatus;
    error: string | null;
    assembly_transcript_id: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface DocumentType {
    id: string;
    title: string;
    description: string | null;
    prompt: string;
    agent_model: string;
    agent_services: string;
}
