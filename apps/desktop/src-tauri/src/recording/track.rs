use super::storage::{AudioFileWriter, VideoFileWriter};
use super::types::*;
use crossbeam::channel::{bounded, Receiver, Sender};
use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread::{self, JoinHandle};

const CHANNEL_BUFFER_SIZE: usize = 1000;

/// Message sent to track recorder thread
#[derive(Debug)]
enum TrackMessage {
    AudioChunk(Vec<u8>),
    VideoChunk(Vec<u8>),
    Stop,
}

/// Handles recording for a single participant's track in a dedicated thread
pub struct TrackRecorder {
    participant_id: String,
    audio_sender: Option<Sender<TrackMessage>>,
    video_sender: Option<Sender<TrackMessage>>,
    audio_thread: Option<JoinHandle<RecordingResult<PathBuf>>>,
    video_thread: Option<JoinHandle<RecordingResult<PathBuf>>>,
    stats: Arc<Mutex<TrackStats>>,
}

#[derive(Debug, Default, Clone)]
pub struct TrackStats {
    pub audio_chunks_received: u64,
    pub video_chunks_received: u64,
    pub audio_bytes_written: u64,
    pub video_bytes_written: u64,
    pub errors: Vec<String>,
}

impl TrackRecorder {
    pub fn new(
        participant_id: String,
        _participant_name: String,
        _config: &RecordingConfig,
        mut audio_writer: Option<AudioFileWriter>,
        mut video_writer: Option<VideoFileWriter>,
    ) -> RecordingResult<Self> {
        let stats = Arc::new(Mutex::new(TrackStats::default()));

        // Setup audio recording thread if audio writer is provided
        let (audio_sender, audio_thread) = if let Some(writer) = audio_writer.take() {
            let (sender, receiver) = bounded::<TrackMessage>(CHANNEL_BUFFER_SIZE);
            let participant_id_clone = participant_id.clone();
            let stats_clone = Arc::clone(&stats);

            let handle = thread::spawn(move || {
                Self::audio_recording_loop(participant_id_clone, receiver, writer, stats_clone)
            });

            (Some(sender), Some(handle))
        } else {
            (None, None)
        };

        // Setup video recording thread if video writer is provided
        let (video_sender, video_thread) = if let Some(writer) = video_writer.take() {
            let (sender, receiver) = bounded::<TrackMessage>(CHANNEL_BUFFER_SIZE);
            let participant_id_clone = participant_id.clone();
            let stats_clone = Arc::clone(&stats);

            let handle = thread::spawn(move || {
                Self::video_recording_loop(participant_id_clone, receiver, writer, stats_clone)
            });

            (Some(sender), Some(handle))
        } else {
            (None, None)
        };

        Ok(Self {
            participant_id,
            audio_sender,
            video_sender,
            audio_thread,
            video_thread,
            stats,
        })
    }

    /// Send audio chunk to the recording thread
    pub fn add_audio_chunk(&self, chunk: Vec<u8>) -> RecordingResult<()> {
        if let Some(sender) = &self.audio_sender {
            sender
                .send(TrackMessage::AudioChunk(chunk))
                .map_err(|_| RecordingError::TrackError("Failed to send audio chunk".to_string()))?;

            let mut stats = self.stats.lock();
            stats.audio_chunks_received += 1;
        }
        Ok(())
    }

    /// Send video chunk to the recording thread
    pub fn add_video_chunk(&self, chunk: Vec<u8>) -> RecordingResult<()> {
        if let Some(sender) = &self.video_sender {
            sender
                .send(TrackMessage::VideoChunk(chunk))
                .map_err(|_| RecordingError::TrackError("Failed to send video chunk".to_string()))?;

            let mut stats = self.stats.lock();
            stats.video_chunks_received += 1;
        }
        Ok(())
    }

    /// Stop recording and wait for threads to finish
    pub fn stop(mut self) -> RecordingResult<TrackRecordingResult> {
        // Send stop signals
        if let Some(sender) = self.audio_sender.take() {
            let _ = sender.send(TrackMessage::Stop);
        }
        if let Some(sender) = self.video_sender.take() {
            let _ = sender.send(TrackMessage::Stop);
        }

        // Wait for threads to complete
        let audio_file = if let Some(handle) = self.audio_thread.take() {
            match handle.join() {
                Ok(result) => Some(result?),
                Err(_) => {
                    return Err(RecordingError::TrackError(
                        "Audio thread panicked".to_string(),
                    ))
                }
            }
        } else {
            None
        };

        let video_file = if let Some(handle) = self.video_thread.take() {
            match handle.join() {
                Ok(result) => Some(result?),
                Err(_) => {
                    return Err(RecordingError::TrackError(
                        "Video thread panicked".to_string(),
                    ))
                }
            }
        } else {
            None
        };

        Ok(TrackRecordingResult {
            participant_id: self.participant_id,
            audio_file,
            video_file,
            stats: self.stats.lock().clone(),
        })
    }

    /// Audio recording thread loop
    fn audio_recording_loop(
        participant_id: String,
        receiver: Receiver<TrackMessage>,
        mut writer: AudioFileWriter,
        stats: Arc<Mutex<TrackStats>>,
    ) -> RecordingResult<PathBuf> {
        log::info!(
            "Audio recording thread started for participant: {}",
            participant_id
        );

        loop {
            match receiver.recv() {
                Ok(TrackMessage::AudioChunk(chunk)) => {
                    // Write WebM chunks directly (already encoded by browser)
                    let chunk_len = chunk.len() as u64;
                    if let Err(e) = writer.write_chunk(&chunk) {
                        let mut stats = stats.lock();
                        stats.errors.push(format!("Audio write error: {}", e));
                        log::error!("Failed to write audio chunk: {}", e);
                    } else {
                        let mut stats = stats.lock();
                        stats.audio_bytes_written += chunk_len;
                    }
                }
                Ok(TrackMessage::Stop) | Err(_) => {
                    log::info!(
                        "Stopping audio recording for participant: {}",
                        participant_id
                    );
                    break;
                }
                _ => {}
            }
        }

        writer.finalize()
    }

    /// Video recording thread loop
    fn video_recording_loop(
        participant_id: String,
        receiver: Receiver<TrackMessage>,
        mut writer: VideoFileWriter,
        stats: Arc<Mutex<TrackStats>>,
    ) -> RecordingResult<PathBuf> {
        log::info!(
            "Video recording thread started for participant: {}",
            participant_id
        );

        loop {
            match receiver.recv() {
                Ok(TrackMessage::VideoChunk(chunk)) => {
                    // Write WebM chunks directly (already encoded by browser)
                    let chunk_len = chunk.len() as u64;
                    if let Err(e) = writer.write_chunk(&chunk) {
                        let mut stats = stats.lock();
                        stats.errors.push(format!("Video write error: {}", e));
                        log::error!("Failed to write video chunk: {}", e);
                    } else {
                        let mut stats = stats.lock();
                        stats.video_bytes_written += chunk_len;
                    }
                }
                Ok(TrackMessage::Stop) | Err(_) => {
                    log::info!(
                        "Stopping video recording for participant: {}",
                        participant_id
                    );
                    break;
                }
                _ => {}
            }
        }

        writer.finalize()
    }

}

#[derive(Debug)]
pub struct TrackRecordingResult {
    pub participant_id: String,
    pub audio_file: Option<PathBuf>,
    pub video_file: Option<PathBuf>,
    pub stats: TrackStats,
}
