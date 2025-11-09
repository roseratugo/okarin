use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
  pub id: String,
  pub name: String,
  pub created_at: DateTime<Utc>,
  pub created_by: String,
  pub participants: HashMap<String, Participant>,
  pub max_participants: usize,
  pub ice_servers: Vec<IceServer>,
}

impl Room {
  pub fn new(name: String, created_by: String, max_participants: usize) -> Self {
    Self {
      id: Uuid::new_v4().to_string(),
      name,
      created_at: Utc::now(),
      created_by,
      participants: HashMap::new(),
      max_participants,
      ice_servers: Self::default_ice_servers(),
    }
  }

  fn default_ice_servers() -> Vec<IceServer> {
    vec![
      IceServer {
        urls: vec!["stun:stun.l.google.com:19302".to_string()],
        username: None,
        credential: None,
      },
      IceServer {
        urls: vec!["stun:stun1.l.google.com:19302".to_string()],
        username: None,
        credential: None,
      },
    ]
  }

  pub fn can_join(&self) -> bool {
    self.participants.len() < self.max_participants
  }

  pub fn add_participant(&mut self, participant: Participant) -> bool {
    if !self.can_join() {
      return false;
    }
    self
      .participants
      .insert(participant.id.clone(), participant);
    true
  }

  pub fn to_public_info(&self) -> RoomInfo {
    RoomInfo {
      id: self.id.clone(),
      name: self.name.clone(),
      created_at: self.created_at,
      participant_count: self.participants.len(),
      max_participants: self.max_participants,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
  pub id: String,
  pub name: String,
  pub joined_at: DateTime<Utc>,
  pub is_host: bool,
}

impl Participant {
  pub fn new(name: String, is_host: bool) -> Self {
    Self {
      id: Uuid::new_v4().to_string(),
      name,
      joined_at: Utc::now(),
      is_host,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceServer {
  pub urls: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub username: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInfo {
  pub id: String,
  pub name: String,
  pub created_at: DateTime<Utc>,
  pub participant_count: usize,
  pub max_participants: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomRequest {
  pub name: String,
  pub created_by: String,
  #[serde(default = "default_max_participants")]
  pub max_participants: usize,
}

fn default_max_participants() -> usize {
  10
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomResponse {
  pub room_id: String,
  pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomRequest {
  pub participant_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomResponse {
  pub token: String,
  pub participant_id: String,
  pub ice_servers: Vec<IceServer>,
}
