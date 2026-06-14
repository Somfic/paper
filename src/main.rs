use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use clap::Parser;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

mod api;
mod app;
mod books;
mod config;
mod logging;
mod proxy;
mod upload;

use app::{AppContext, Result};
use config::Config;

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
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .event_format(logging::PaperFormatter)
        .init();

    let cli = Cli::parse();

    let mut config = Config::from_file(&cli.config)?;
    config.apply_env_overrides();

    if let Some(host) = cli.host {
        config.host = host;
    }
    if let Some(port) = cli.port {
        config.port = port;
    }
    if let Some(data_dir) = cli.data_dir {
        config.data_dir = data_dir;
    }
    if cli.database_url.is_some() {
        config.database_url = cli.database_url;
    }

    let config = Arc::new(config);

    // Initialize core services
    let pool = app::create_pool(&config).await?;
    let storage = app::create_storage(&config).await?;
    let events = draad::runtime::EventBus::new();
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let ctx = AppContext {
        db: pool,
        storage,
        config: config.clone(),
        events,
        conns: draad::runtime::Conns::new(),
        http,
    };

    // Build router
    let mut router = Router::new();

    // Mount schema-generated RPC routes (JSON one-shots).
    info!("mounting rpc at /api/rpc");
    router = router.nest("/api/rpc", rpc_router().with_state(ctx.clone()));

    // Binary routes: epub upload + file serving (absolute paths, merged flat).
    info!("mounting upload + file routes");
    router = router.merge(upload::router().with_state(ctx.clone()));

    // Frontend: dev proxy or static files
    if cli.dev {
        // The vite dev server is started alongside the backend by `just dev`;
        // here we just proxy the UI through to it.
        let dev_port = 5174u16;
        info!("proxying ui → http://localhost:{dev_port}");
        let dev_proxy = proxy::DevProxy::new(dev_port);
        router = router.fallback(move |req: axum::extract::Request| {
            proxy::dev_proxy_handler(axum::extract::State(dev_proxy.clone()), req)
        });
    } else {
        let build_dir = PathBuf::from("frontend/build");
        if build_dir.exists() {
            info!("mounting ui at /");
            let fallback = ServeFile::new(build_dir.join("index.html"));
            let service = ServeDir::new(&build_dir)
                .append_index_html_on_directories(true)
                .fallback(fallback);
            router = router.fallback_service(service);
        }
    }

    // Start server
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
