//! Router assembly: the schema-generated RPC routes, the binary upload/file
//! routes, and the frontend (a dev proxy to vite, or static files in release).

use std::path::PathBuf;

use axum::Router;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

use crate::app::AppContext;
use crate::{proxy, upload};

/// The vite dev server port, started alongside the backend by `just dev`.
const VITE_DEV_PORT: u16 = 5174;

/// Build the full application router. When `dev` is set the UI is proxied to the
/// running vite dev server; otherwise the prebuilt `frontend/build` is served.
pub fn build_router(ctx: AppContext, dev: bool) -> Router {
    // Mount schema-generated RPC routes (JSON one-shots).
    info!("mounting rpc at /api/rpc");
    let mut router = Router::new().nest("/api/rpc", crate::rpc_router().with_state(ctx.clone()));

    // Binary routes: epub upload + file serving (absolute paths, merged flat).
    info!("mounting upload + file routes");
    router = router.merge(upload::router().with_state(ctx.clone()));

    if dev {
        info!("proxying ui → http://localhost:{VITE_DEV_PORT}");
        let dev_proxy = proxy::DevProxy::new(VITE_DEV_PORT);
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

    router
}
