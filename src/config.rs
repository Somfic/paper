use std::env;
use std::path::PathBuf;

use serde::Deserialize;

use crate::app::{Error, Result};

#[derive(Deserialize)]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,
    pub database_url: Option<String>,

    /// Hardcover GraphQL API token (https://hardcover.app account settings).
    /// Search works without it; full metadata details require it.
    #[serde(default)]
    pub hardcover_api_key: String,
}

impl Config {
    pub fn from_file(path: impl AsRef<std::path::Path>) -> Result<Self> {
        let path = path.as_ref();
        match std::fs::read_to_string(path) {
            Ok(content) => Ok(toml::from_str(&content)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(toml::from_str("")?),
            Err(e) => Err(Error::ConfigReadError {
                path: path.display().to_string(),
                source: e,
            }),
        }
    }

    pub fn apply_env_overrides(&mut self) {
        if let Ok(v) = env::var("PAPER_HARDCOVER_API_KEY") {
            self.hardcover_api_key = v;
        }
    }
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}

fn default_port() -> u16 {
    3000
}

fn default_data_dir() -> PathBuf {
    PathBuf::from("./data/")
}
