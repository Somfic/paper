//! Binary routes that can't ride the JSON-RPC layer: multipart epub upload and
//! raw file serving for the reader. Mounted flat (absolute `/api/...` paths) in
//! `main.rs`, parallel to cinema's `raw.rs`.

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::header,
    response::{IntoResponse, Response},
    routing::{get, post},
};

use crate::app::AppContext;
use crate::books::{self, Book};
use crate::error::Error;

/// Generous cap — epubs are small, but some illustrated ones run large.
const MAX_UPLOAD: usize = 64 * 1024 * 1024;

pub fn router() -> Router<AppContext> {
    Router::new()
        // The body-limit layer applies to routes added *before* it, so only the
        // upload route gets the raised cap.
        .route("/api/upload", post(upload))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD))
        .route("/api/book/{id}", get(serve_book))
}

/// Accept a multipart upload with a single file field, store it under
/// `storage/books/{id}.{ext}`, and return the created book.
async fn upload(
    State(ctx): State<AppContext>,
    mut multipart: Multipart,
) -> Result<Json<Book>, Error> {
    let mut file_bytes: Option<bytes::Bytes> = None;
    let mut filename = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| Error::Generic(format!("malformed upload: {e}")))?
    {
        if let Some(name) = field.file_name() {
            filename = name.to_string();
            file_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| Error::Generic(format!("failed to read upload: {e}")))?,
            );
            break;
        }
    }

    let bytes = file_bytes.ok_or_else(|| Error::Generic("no file in upload".into()))?;

    let path = std::path::Path::new(&filename);
    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("epub")
        .to_lowercase();
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&filename)
        .to_string();

    let id = books::insert(&ctx.db, &title, &filename, &format).await?;

    let dir = ctx.storage.join("books");
    tokio::fs::create_dir_all(&dir).await?;
    let rel_path = format!("books/{id}.{format}");
    tokio::fs::write(ctx.storage.join(&rel_path), &bytes).await?;
    books::set_file_path(&ctx.db, id, &rel_path).await?;

    let book = books::get(&ctx.db, id)
        .await?
        .ok_or_else(|| Error::NotFound("book vanished after insert".into()))?;
    tracing::info!("uploaded book {id}: {}", book.title);
    Ok(Json(book))
}

/// Serve the raw book file for the reader (foliate-js fetches the whole thing).
async fn serve_book(State(ctx): State<AppContext>, Path(id): Path<i64>) -> Result<Response, Error> {
    let book = books::get(&ctx.db, id)
        .await?
        .ok_or_else(|| Error::NotFound("book not found".into()))?;
    if book.file_path.is_empty() {
        return Err(Error::NotFound("book has no file".into()));
    }
    let abs = ctx.storage.join(&book.file_path);
    let data = tokio::fs::read(&abs).await?;
    let ctype = mime_guess::from_path(&abs)
        .first_raw()
        .unwrap_or("application/epub+zip");
    Ok(([(header::CONTENT_TYPE, ctype)], data).into_response())
}
