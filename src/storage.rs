//! On-disk blob storage rooted at `<data_dir>/fs`. Book files live under
//! `books/{id}.{ext}` relative to this root.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::config::Config;
use crate::error::Result;

#[derive(Clone)]
pub struct Storage(Arc<PathBuf>);

impl Storage {
    pub fn path(&self) -> &Path {
        &self.0
    }
    pub fn join(&self, p: impl AsRef<Path>) -> PathBuf {
        self.0.join(p)
    }
}

pub async fn create_storage(config: &Config) -> Result<Storage> {
    let path = config.data_dir.join("fs");
    tokio::fs::create_dir_all(&path).await?;
    Ok(Storage(Arc::new(path)))
}
