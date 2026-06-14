use crate::app::AppContext;
pub use crate::app::Error;

/// Liveness probe + build info. Exists mainly to prove the draad RPC pipeline
/// (Rust trait → generated TS client) is wired end-to-end before any real
/// feature code lands.
#[draad::ty]
pub struct Health {
    pub status: String,
    pub name: String,
    pub version: String,
}

#[draad::api(namespace = "health")]
pub trait HealthApi {
    /// Returns `ok` plus the crate name and version.
    #[get]
    async fn ping(&self) -> Result<Health, Error>;
}

#[draad::api]
impl HealthApi for AppContext {
    async fn ping(&self) -> Result<Health, Error> {
        Ok(Health {
            status: "ok".into(),
            name: env!("CARGO_PKG_NAME").into(),
            version: env!("CARGO_PKG_VERSION").into(),
        })
    }
}
