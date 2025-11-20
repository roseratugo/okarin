use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingConfig {
    pub room_id: String,
    pub output_dir: PathBuf,
    pub audio_sample_rate: u32,
    pub audio_channels: u16,
    pub video_width: u32,
    pub video_height: u32,
    pub video_fps: u32,
}

impl Default for RecordingConfig {
    fn default() -> Self {
        Self {
            room_id: String::new(),
            output_dir: PathBuf::new(),
            audio_sample_rate: 48000, // 48kHz for best quality
            audio_channels: 2,         // Stereo
            video_width: 1920,
            video_height: 1080,
            video_fps: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMetadata {
    pub id: String,
    pub room_id: String,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub duration_seconds: u64,
    pub participants: HashMap<String, ParticipantMetadata>,
    pub output_directory: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParticipantMetadata {
    pub id: String,
    pub name: String,
    pub audio_file: Option<PathBuf>,
    pub video_file: Option<PathBuf>,
    pub joined_at: DateTime<Utc>,
    pub left_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecordingStatus {
    Idle,
    Recording { started_at: DateTime<Utc> },
    Paused { started_at: DateTime<Utc>, paused_at: DateTime<Utc> },
    Stopped,
}

#[derive(Debug, thiserror::Error)]
pub enum RecordingError {
    #[error("Recording already in progress")]
    AlreadyRecording,

    #[error("No active recording")]
    NoActiveRecording,

    #[error("Participant not found: {0}")]
    ParticipantNotFound(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Track error: {0}")]
    TrackError(String),

    #[error("Invalid chunk data")]
    InvalidChunkData,

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

// Sérialisation structurée pour le frontend
#[derive(serde::Serialize)]
#[serde(tag = "kind", content = "message")]
#[serde(rename_all = "camelCase")]
enum RecordingErrorKind {
    AlreadyRecording(String),
    NoActiveRecording(String),
    ParticipantNotFound(String),
    IoError(String),
    TrackError(String),
    InvalidChunkData(String),
    InvalidConfig(String),
}

impl serde::Serialize for RecordingError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        let error_message = self.to_string();
        let error_kind = match self {
            Self::AlreadyRecording => RecordingErrorKind::AlreadyRecording(error_message),
            Self::NoActiveRecording => RecordingErrorKind::NoActiveRecording(error_message),
            Self::ParticipantNotFound(_) => RecordingErrorKind::ParticipantNotFound(error_message),
            Self::IoError(_) => RecordingErrorKind::IoError(error_message),
            Self::TrackError(_) => RecordingErrorKind::TrackError(error_message),
            Self::InvalidChunkData => RecordingErrorKind::InvalidChunkData(error_message),
            Self::InvalidConfig(_) => RecordingErrorKind::InvalidConfig(error_message),
        };
        error_kind.serialize(serializer)
    }
}

pub type RecordingResult<T> = Result<T, RecordingError>;
