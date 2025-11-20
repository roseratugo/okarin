// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod recording;

use commands::RecordingState;
use std::path::PathBuf;

#[tauri::command]
fn generate_room_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("room-{}", duration.as_secs())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_app_name() -> String {
    env!("CARGO_PKG_NAME").to_string()
}

#[tauri::command]
fn get_recording_directory() -> Result<PathBuf, String> {
    // Utiliser dirs pour une meilleure compatibilité cross-platform
    let base_dir = dirs::audio_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Could not determine home or audio directory".to_string())?;

    let recording_dir = base_dir.join("Podcast Recorder");

    std::fs::create_dir_all(&recording_dir)
        .map_err(|e| format!("Failed to create recording directory: {}", e))?;

    Ok(recording_dir)
}

fn main() {
    // Initialize logger
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(RecordingState::new())
        .invoke_handler(tauri::generate_handler![
            generate_room_id,
            get_app_version,
            get_app_name,
            get_recording_directory,
            commands::start_recording,
            commands::stop_recording,
            commands::pause_recording,
            commands::resume_recording,
            commands::add_participant_track,
            commands::add_audio_chunk,
            commands::add_video_chunk,
            commands::get_recording_status,
            commands::get_recording_metadata,
            commands::get_recording_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}