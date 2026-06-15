//! The composite application state shared by every handler.
//!
//! draad owns the transport: `EventBus` is the broadcast bus the generated
//! emitters publish to, and `Conns` is its registry of live WebSocket sockets
//! (keyed by the server-assigned `client_id`). `FromRef` lets generated handlers
//! pull these out of the composite state.

use std::sync::Arc;

use axum::extract::FromRef;
use reqwest::Client;

use crate::config::Config;
use crate::db::{self, Pool};
use crate::error::Result;
use crate::storage::{self, Storage};

#[derive(Clone, FromRef)]
pub struct AppContext {
    pub db: Pool,
    pub storage: Storage,
    pub config: Arc<Config>,
    pub events: draad::runtime::EventBus,
    /// draad's registry of live WS connections — the basis for server→client
    /// addressing and `conn: &Conn` injection.
    pub conns: draad::runtime::Conns,
    pub http: Client,
}

impl AppContext {
    /// Initialize the core services (db pool, blob storage, event bus, HTTP
    /// client) and assemble the shared context.
    pub async fn new(config: Arc<Config>) -> Result<Self> {
        let db = db::create_pool(&config).await?;
        let storage = storage::create_storage(&config).await?;
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;

        Ok(Self {
            db,
            storage,
            config,
            events: draad::runtime::EventBus::new(),
            conns: draad::runtime::Conns::new(),
            http,
        })
    }
}
