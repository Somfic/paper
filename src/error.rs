//! The crate-wide error type and its HTTP mapping.

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
