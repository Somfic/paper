use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use clap::Parser;
use tracing::info;

mod api;
mod app;
mod books;
mod config;
mod db;
mod error;
mod logging;
mod proxy;
mod server;
mod storage;
mod upload;

use app::AppContext;
use config::Config;
use error::Result;

// Runs the scan→emit codegen at macro-expansion time. A plain `cargo build`
// writes `frontend/src/lib/schema/index.ts` as a side effect — no build.rs.
draad::include_generated!(crate::AppContext, draad::runtime::EventBus);

#[derive(Parser)]
#[command(name = "paper", about = "Paper ebook server")]
struct Cli {
    /// Host address to bind to
    #[arg(long, env = "PAPER_HOST")]
    host: Option<String>,

    /// Port to listen on
    #[arg(short, long, env = "PAPER_PORT")]
    port: Option<u16>,

    /// Path to data directory
    #[arg(long, env = "PAPER_DATA_DIR")]
    data_dir: Option<PathBuf>,

    /// Database URL (e.g. sqlite:./data.db, postgres://user:pass@host/db)
    #[arg(long, env = "PAPER_DATABASE_URL")]
    database_url: Option<String>,

    /// Path to config file
    #[arg(short, long, default_value = "paper.toml", env = "PAPER_CONFIG")]
    config: PathBuf,

    /// Run in development mode (proxy UI to the vite dev server)
    #[arg(long)]
    dev: bool,
}

impl Cli {
    /// Load the config file and layer the CLI flags on top of it.
    fn load_config(&self) -> Result<Config> {
        let mut config = Config::from_file(&self.config)?;
        config.apply_env_overrides();

        if let Some(host) = self.host.clone() {
            config.host = host;
        }
        if let Some(port) = self.port {
            config.port = port;
        }
        if let Some(data_dir) = self.data_dir.clone() {
            config.data_dir = data_dir;
        }
        if self.database_url.is_some() {
            config.database_url = self.database_url.clone();
        }

        Ok(config)
    }
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    match run().await {
        Ok(_) => Ok(()),
        Err(e) => {
            eprintln!("Error: {e}");
            std::process::exit(1);
        }
    }
}

async fn run() -> Result<()> {
    logging::init();

    let cli = Cli::parse();
    let config = Arc::new(cli.load_config()?);

    let ctx = AppContext::new(config.clone()).await?;
    let router = server::build_router(ctx, cli.dev);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("listening on http://{addr}");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("shutdown signal received, draining connections...");
}
