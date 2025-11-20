use crate::recording::{
    RecordingConfig, RecordingError, RecordingManager, RecordingMetadata, RecordingStatus,
};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

/// Global recording manager state
pub struct RecordingState {
    pub manager: Arc<RecordingManager>,
}

impl RecordingState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(RecordingManager::new()),
        }
    }
}

#[tauri::command]
pub async fn start_recording(
    state: State<'_, RecordingState>,
    room_id: String,
    output_dir: PathBuf,
    audio_sample_rate: Option<u32>,
    audio_channels: Option<u16>,
    video_width: Option<u32>,
    video_height: Option<u32>,
    video_fps: Option<u32>,
) -> Result<String, RecordingError> {
    // Validation des entrées
    if room_id.trim().is_empty() {
        return Err(RecordingError::InvalidConfig("room_id cannot be empty".into()));
    }
    if !output_dir.exists() {
        return Err(RecordingError::InvalidConfig(format!(
            "output directory does not exist: {:?}",
            output_dir
        )));
    }

    let config = RecordingConfig {
        room_id,
        output_dir,
        audio_sample_rate: audio_sample_rate.unwrap_or(48000),
        audio_channels: audio_channels.unwrap_or(2),
        video_width: video_width.unwrap_or(1920),
        video_height: video_height.unwrap_or(1080),
        video_fps: video_fps.unwrap_or(30),
    };

    state.manager.start_recording(config)
}

#[tauri::command]
pub async fn stop_recording(
    state: State<'_, RecordingState>,
) -> Result<RecordingMetadata, RecordingError> {
    state.manager.stop_recording()
}

#[tauri::command]
pub async fn pause_recording(state: State<'_, RecordingState>) -> Result<(), RecordingError> {
    state.manager.pause_recording()
}

#[tauri::command]
pub async fn resume_recording(state: State<'_, RecordingState>) -> Result<(), RecordingError> {
    state.manager.resume_recording()
}

#[tauri::command]
pub async fn add_participant_track(
    state: State<'_, RecordingState>,
    participant_id: String,
    participant_name: String,
    record_audio: bool,
    record_video: bool,
) -> Result<(), RecordingError> {
    // Validation
    if participant_id.trim().is_empty() {
        return Err(RecordingError::InvalidConfig(
            "participant_id cannot be empty".into(),
        ));
    }

    state
        .manager
        .add_participant(participant_id, participant_name, record_audio, record_video)
}

#[tauri::command]
pub async fn add_audio_chunk(
    state: State<'_, RecordingState>,
    participant_id: String,
    chunk: Vec<u8>,
) -> Result<(), RecordingError> {
    if chunk.is_empty() {
        return Err(RecordingError::InvalidChunkData);
    }
    state.manager.add_audio_chunk(&participant_id, chunk)
}

#[tauri::command]
pub async fn add_video_chunk(
    state: State<'_, RecordingState>,
    participant_id: String,
    chunk: Vec<u8>,
) -> Result<(), RecordingError> {
    if chunk.is_empty() {
        return Err(RecordingError::InvalidChunkData);
    }
    state.manager.add_video_chunk(&participant_id, chunk)
}

#[tauri::command]
pub async fn get_recording_status(
    state: State<'_, RecordingState>,
) -> Result<RecordingStatus, RecordingError> {
    Ok(state.manager.get_status())
}

#[tauri::command]
pub async fn get_recording_metadata(
    state: State<'_, RecordingState>,
) -> Result<Option<RecordingMetadata>, RecordingError> {
    Ok(state.manager.get_metadata())
}

#[tauri::command]
pub async fn get_recording_id(
    state: State<'_, RecordingState>,
) -> Result<Option<String>, RecordingError> {
    Ok(state.manager.get_recording_id())
}
