//! Database pool creation. The URL is resolved from (in order) the config file,
//! the `PAPER_DATABASE_URL`/`DATABASE_URL` env vars, or a SQLite file under the
//! data directory. Migrations run on connect.

use crate::config::Config;
use crate::error::Result;

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
