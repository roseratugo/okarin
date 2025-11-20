use super::types::*;
use chrono::Utc;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Manages file storage for multitrack recordings
pub struct StorageManager {
    output_dir: PathBuf,
    recording_id: String,
}

impl StorageManager {
    pub fn new(base_dir: PathBuf, room_id: &str) -> RecordingResult<Self> {
        let timestamp = Utc::now().format("%Y-%m-%d_%H-%M-%S");
        let recording_id = format!("recording-{}-{}", room_id, timestamp);
        let output_dir = base_dir.join(&recording_id);

        // Create recording directory
        fs::create_dir_all(&output_dir)?;

        Ok(Self {
            output_dir,
            recording_id,
        })
    }

    pub fn get_output_dir(&self) -> &Path {
        &self.output_dir
    }

    pub fn get_recording_id(&self) -> &str {
        &self.recording_id
    }

    /// Create WebM file for audio track (Opus codec)
    pub fn create_audio_file(
        &self,
        participant_id: &str,
        participant_name: &str,
        _config: &RecordingConfig,
    ) -> RecordingResult<AudioFileWriter> {
        let filename = format!("{}-{}-audio.webm", participant_id, sanitize_filename(participant_name));
        let path = self.output_dir.join(&filename);

        let file = File::create(&path)?;

        Ok(AudioFileWriter {
            file,
            path,
            chunk_count: 0,
        })
    }

    /// Create WebM video file (will contain VP9/H264 encoded video)
    pub fn create_video_file(
        &self,
        participant_id: &str,
        participant_name: &str,
    ) -> RecordingResult<VideoFileWriter> {
        let filename = format!("{}-{}-video.webm", participant_id, sanitize_filename(participant_name));
        let path = self.output_dir.join(&filename);

        let file = File::create(&path)?;

        Ok(VideoFileWriter {
            file,
            path,
            chunk_count: 0,
        })
    }

    /// Save recording metadata to JSON
    pub fn save_metadata(&self, metadata: &RecordingMetadata) -> RecordingResult<()> {
        let path = self.output_dir.join("metadata.json");
        let json = serde_json::to_string_pretty(metadata)
            .map_err(|e| RecordingError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e)))?;

        fs::write(path, json)?;
        Ok(())
    }
}

/// Helper to sanitize filenames
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => c,
            _ => '_',
        })
        .collect()
}

/// Writer for audio files (WebM format with Opus codec)
pub struct AudioFileWriter {
    file: File,
    path: PathBuf,
    chunk_count: u64,
}

impl AudioFileWriter {
    /// Write WebM audio chunk from MediaRecorder
    pub fn write_chunk(&mut self, chunk: &[u8]) -> RecordingResult<()> {
        // Write WebM chunks directly as they come from the browser
        self.file.write_all(chunk)?;
        self.chunk_count += 1;
        Ok(())
    }

    pub fn finalize(self) -> RecordingResult<PathBuf> {
        // File is automatically closed when dropped
        Ok(self.path)
    }
}

/// Writer for video files (WebM format)
pub struct VideoFileWriter {
    file: File,
    path: PathBuf,
    chunk_count: u64,
}

impl VideoFileWriter {
    /// Write WebM video chunk from MediaRecorder
    pub fn write_chunk(&mut self, chunk_data: &[u8]) -> RecordingResult<()> {
        // Write WebM chunks directly as they come from the browser
        // MediaRecorder already produces valid WebM segments
        self.file.write_all(chunk_data)?;
        self.chunk_count += 1;
        Ok(())
    }

    pub fn finalize(self) -> RecordingResult<PathBuf> {
        // File is automatically closed when dropped
        Ok(self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("John Doe"), "John_Doe");
        assert_eq!(sanitize_filename("user@example.com"), "user_example_com");
        assert_eq!(sanitize_filename("test-user_123"), "test-user_123");
    }
}
