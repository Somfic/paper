use crate::db::Pool;
use crate::error::Result;

/// A book in the library. For this milestone the metadata is just what we can
/// derive from the uploaded file (title from the filename); richer metadata
/// (Hardcover) comes later.
#[draad::ty]
#[derive(sqlx::FromRow)]
pub struct Book {
    pub id: i64,
    pub title: String,
    pub original_filename: String,
    /// Path relative to the storage root, e.g. `books/3.epub`.
    pub file_path: String,
    pub format: String,
    pub added_at: String,
}

/// Insert a new book row (file_path filled in afterwards once we know the id)
/// and return its id.
pub async fn insert(db: &Pool, title: &str, original_filename: &str, format: &str) -> Result<i64> {
    let (id,): (i64,) = sqlx::query_as(
        "INSERT INTO books (title, original_filename, file_path, format) \
         VALUES (?, ?, '', ?) RETURNING id",
    )
    .bind(title)
    .bind(original_filename)
    .bind(format)
    .fetch_one(db)
    .await?;
    Ok(id)
}

pub async fn set_file_path(db: &Pool, id: i64, file_path: &str) -> Result<()> {
    sqlx::query("UPDATE books SET file_path = ? WHERE id = ?")
        .bind(file_path)
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

pub async fn list(db: &Pool) -> Result<Vec<Book>> {
    Ok(
        sqlx::query_as::<_, Book>("SELECT * FROM books ORDER BY id DESC")
            .fetch_all(db)
            .await?,
    )
}

pub async fn get(db: &Pool, id: i64) -> Result<Option<Book>> {
    Ok(
        sqlx::query_as::<_, Book>("SELECT * FROM books WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await?,
    )
}

pub async fn delete(db: &Pool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM books WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}
