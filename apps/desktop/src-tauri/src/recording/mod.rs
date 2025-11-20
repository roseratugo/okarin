pub mod encoder;
pub mod recorder;
pub mod storage;
pub mod track;
pub mod types;

pub use recorder::RecordingManager;
pub use types::{RecordingConfig, RecordingError, RecordingMetadata, RecordingStatus};
