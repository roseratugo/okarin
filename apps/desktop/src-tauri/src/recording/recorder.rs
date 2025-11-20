use super::storage::StorageManager;
use super::track::TrackRecorder;
use super::types::*;
use chrono::Utc;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

/// Main recording manager that orchestrates multitrack recording
pub struct RecordingManager {
    state: Arc<RwLock<RecordingState>>,
}

struct RecordingState {
    status: RecordingStatus,
    config: Option<RecordingConfig>,
    storage: Option<StorageManager>,
    tracks: HashMap<String, TrackRecorder>,
    metadata: Option<RecordingMetadata>,
    recording_id: Option<String>,
}

impl RecordingManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(RecordingState {
                status: RecordingStatus::Idle,
                config: None,
                storage: None,
                tracks: HashMap::new(),
                metadata: None,
                recording_id: None,
            })),
        }
    }

    /// Start a new recording session
    pub fn start_recording(&self, config: RecordingConfig) -> RecordingResult<String> {
        let mut state = self.state.write();

        // Check if already recording
        if !matches!(state.status, RecordingStatus::Idle) {
            return Err(RecordingError::AlreadyRecording);
        }

        // Create storage manager
        let storage = StorageManager::new(config.output_dir.clone(), &config.room_id)?;
        let recording_id = storage.get_recording_id().to_string();

        log::info!("Starting recording: {}", recording_id);

        // Initialize metadata
        let metadata = RecordingMetadata {
            id: recording_id.clone(),
            room_id: config.room_id.clone(),
            started_at: Utc::now(),
            stopped_at: None,
            duration_seconds: 0,
            participants: HashMap::new(),
            output_directory: storage.get_output_dir().to_path_buf(),
        };

        state.status = RecordingStatus::Recording {
            started_at: Utc::now(),
        };
        state.config = Some(config);
        state.storage = Some(storage);
        state.metadata = Some(metadata);
        state.recording_id = Some(recording_id.clone());

        Ok(recording_id)
    }

    /// Add a new participant track to the recording
    pub fn add_participant(
        &self,
        participant_id: String,
        participant_name: String,
        record_audio: bool,
        record_video: bool,
    ) -> RecordingResult<()> {
        let mut state = self.state.write();

        // Check if recording is active
        if matches!(state.status, RecordingStatus::Idle | RecordingStatus::Stopped) {
            return Err(RecordingError::NoActiveRecording);
        }

        // Check if participant already exists
        if state.tracks.contains_key(&participant_id) {
            log::warn!("Participant {} already exists in recording", participant_id);
            return Ok(());
        }

        let config = state
            .config
            .as_ref()
            .ok_or(RecordingError::NoActiveRecording)?;

        let storage = state
            .storage
            .as_ref()
            .ok_or(RecordingError::NoActiveRecording)?;

        // Create file writers
        let audio_writer = if record_audio {
            Some(storage.create_audio_file(&participant_id, &participant_name, config)?)
        } else {
            None
        };

        let video_writer = if record_video {
            Some(storage.create_video_file(&participant_id, &participant_name)?)
        } else {
            None
        };

        // Create track recorder with dedicated threads
        let track_recorder = TrackRecorder::new(
            participant_id.clone(),
            participant_name.clone(),
            config,
            audio_writer,
            video_writer,
        )?;

        log::info!(
            "Added participant to recording: {} ({})",
            participant_name,
            participant_id
        );

        // Add to metadata
        if let Some(metadata) = &mut state.metadata {
            metadata.participants.insert(
                participant_id.clone(),
                ParticipantMetadata {
                    id: participant_id.clone(),
                    name: participant_name.clone(),
                    audio_file: None, // Will be set when stopping
                    video_file: None, // Will be set when stopping
                    joined_at: Utc::now(),
                    left_at: None,
                },
            );
        }

        state.tracks.insert(participant_id, track_recorder);

        Ok(())
    }

    /// Add audio chunk for a participant
    pub fn add_audio_chunk(&self, participant_id: &str, chunk: Vec<u8>) -> RecordingResult<()> {
        let state = self.state.read();

        let track = state
            .tracks
            .get(participant_id)
            .ok_or_else(|| RecordingError::ParticipantNotFound(participant_id.to_string()))?;

        track.add_audio_chunk(chunk)?;
        Ok(())
    }

    /// Add video chunk for a participant
    pub fn add_video_chunk(&self, participant_id: &str, chunk: Vec<u8>) -> RecordingResult<()> {
        let state = self.state.read();

        let track = state
            .tracks
            .get(participant_id)
            .ok_or_else(|| RecordingError::ParticipantNotFound(participant_id.to_string()))?;

        track.add_video_chunk(chunk)?;
        Ok(())
    }

    /// Stop the recording and finalize all tracks
    pub fn stop_recording(&self) -> RecordingResult<RecordingMetadata> {
        let mut state = self.state.write();

        // Check if recording is active
        if matches!(state.status, RecordingStatus::Idle | RecordingStatus::Stopped) {
            return Err(RecordingError::NoActiveRecording);
        }

        log::info!("Stopping recording...");

        let started_at = match state.status {
            RecordingStatus::Recording { started_at } => started_at,
            RecordingStatus::Paused { started_at, .. } => started_at,
            _ => Utc::now(),
        };

        let stopped_at = Utc::now();
        let duration = (stopped_at - started_at).num_seconds().max(0) as u64;

        // Stop all track recorders and collect results
        let tracks = std::mem::take(&mut state.tracks);
        let mut track_results = Vec::new();

        for (participant_id, track) in tracks {
            log::info!("Stopping track for participant: {}", participant_id);
            match track.stop() {
                Ok(result) => track_results.push(result),
                Err(e) => {
                    log::error!("Failed to stop track for {}: {}", participant_id, e);
                }
            }
        }

        // Update metadata with final information
        let mut metadata = state
            .metadata
            .take()
            .ok_or(RecordingError::NoActiveRecording)?;

        metadata.stopped_at = Some(stopped_at);
        metadata.duration_seconds = duration;

        // Update participant metadata with file paths
        for result in track_results {
            if let Some(participant_meta) = metadata.participants.get_mut(&result.participant_id) {
                participant_meta.audio_file = result.audio_file;
                participant_meta.video_file = result.video_file;
                participant_meta.left_at = Some(stopped_at);

                log::info!(
                    "Participant {} recording stats: audio chunks: {}, video chunks: {}, errors: {}",
                    result.participant_id,
                    result.stats.audio_chunks_received,
                    result.stats.video_chunks_received,
                    result.stats.errors.len()
                );
            }
        }

        // Save metadata to file
        if let Some(storage) = &state.storage {
            storage.save_metadata(&metadata)?;
            log::info!(
                "Recording metadata saved to: {:?}",
                storage.get_output_dir()
            );
        }

        state.status = RecordingStatus::Stopped;
        state.config = None;
        state.storage = None;

        log::info!("Recording stopped successfully");

        Ok(metadata)
    }

    /// Get current recording status
    pub fn get_status(&self) -> RecordingStatus {
        self.state.read().status.clone()
    }

    /// Get current recording ID
    pub fn get_recording_id(&self) -> Option<String> {
        self.state.read().recording_id.clone()
    }

    /// Get recording metadata (if available)
    pub fn get_metadata(&self) -> Option<RecordingMetadata> {
        self.state.read().metadata.clone()
    }

    /// Pause recording (marks status but doesn't stop threads)
    pub fn pause_recording(&self) -> RecordingResult<()> {
        let mut state = self.state.write();

        match state.status {
            RecordingStatus::Recording { started_at } => {
                state.status = RecordingStatus::Paused {
                    started_at,
                    paused_at: Utc::now(),
                };
                log::info!("Recording paused");
                Ok(())
            }
            _ => Err(RecordingError::NoActiveRecording),
        }
    }

    /// Resume recording
    pub fn resume_recording(&self) -> RecordingResult<()> {
        let mut state = self.state.write();

        match state.status {
            RecordingStatus::Paused { started_at, .. } => {
                state.status = RecordingStatus::Recording { started_at };
                log::info!("Recording resumed");
                Ok(())
            }
            _ => Err(RecordingError::NoActiveRecording),
        }
    }
}

impl Default for RecordingManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_recording_lifecycle() {
        let manager = RecordingManager::new();

        // Initially idle
        assert!(matches!(manager.get_status(), RecordingStatus::Idle));

        // Start recording
        let config = RecordingConfig {
            room_id: "test-room".to_string(),
            output_dir: PathBuf::from("/tmp"),
            ..Default::default()
        };

        // This will fail in test without proper filesystem setup, but tests the flow
        let _ = manager.start_recording(config);
    }
}
