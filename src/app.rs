use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::FromRef;
use reqwest::Client;

use crate::config::Config;

// ── Error ──

pub type Result<T> = std::result::Result<T, Error>;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("config error: {0}")]
    TomlError(#[from] toml::de::Error),
    #[error("database error: {0}")]
    DatabaseError(#[from] sqlx::Error),
    #[error("http client error: {0}")]
    HttpClientError(#[from] reqwest::Error),
    #[error("failed to read config '{path}': {source}")]
    ConfigReadError {
        path: String,
        source: std::io::Error,
    },
    #[error("io error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("migration error: {0}")]
    MigrationError(#[from] sqlx::migrate::MigrateError),
    #[error("address parse error: {0}")]
    AddressParseError(#[from] std::net::AddrParseError),
    #[error("{0}")]
    Generic(String),
    #[error("{0}")]
    NotFound(String),
    #[error("json error: {0}")]
    JsonError(#[from] serde_json::Error),
}

// draad returns the trait's `Result<_, Error>` straight to axum, so the error
// type owns its HTTP mapping. The body shape — `{ kind, message }` — matches the
// frontend's `schema/error.ts::RpcErrorPayload`.
impl axum::response::IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        use axum::http::StatusCode;
        let (status, kind) = match &self {
            Error::NotFound(_) => (StatusCode::NOT_FOUND, "NotFound"),
            Error::HttpClientError(_) => (StatusCode::BAD_GATEWAY, "HttpClient"),
            Error::TomlError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Toml"),
            Error::DatabaseError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database"),
            Error::ConfigReadError { .. } => (StatusCode::INTERNAL_SERVER_ERROR, "ConfigRead"),
            Error::IoError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Io"),
            Error::MigrationError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Migration"),
            Error::AddressParseError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "AddressParse"),
            Error::Generic(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Generic"),
            Error::JsonError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Json"),
        };
        let body = axum::Json(serde_json::json!({
            "kind": kind,
            "message": self.to_string(),
        }));
        (status, body).into_response()
    }
}

// ── Database ──

pub type Pool = sqlx::AnyPool;

pub async fn create_pool(config: &Config) -> Result<Pool> {
    sqlx::any::install_default_drivers();

    let url = if let Some(ref database_url) = config.database_url {
        database_url.clone()
    } else if let Ok(database_url) =
        std::env::var("PAPER_DATABASE_URL").or_else(|_| std::env::var("DATABASE_URL"))
    {
        database_url
    } else {
        let dir = config.data_dir.join("db");
        tokio::fs::create_dir_all(&dir).await?;
        let db_path = dir.join("data.db");
        format!("sqlite:{}?mode=rwc", db_path.display())
    };

    tracing::info!("connecting to database at {url}");

    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

// ── Storage ──

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

// ── App Context ──
//
// draad owns the transport: `EventBus` is the broadcast bus the generated
// emitters publish to, and `Conns` is its registry of live WebSocket sockets
// (keyed by the server-assigned `client_id`). `FromRef` lets generated handlers
// pull these out of the composite state.

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
