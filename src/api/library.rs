use crate::app::AppContext;
pub use crate::app::Error;
pub use crate::books::Book;

use crate::books;

#[draad::api(namespace = "library")]
pub trait LibraryApi {
    /// All books in the library, newest first.
    #[get]
    async fn list(&self) -> Result<Vec<Book>, Error>;

    /// A single book by id.
    #[get]
    async fn get(&self, id: i64) -> Result<Book, Error>;

    /// Remove a book row and delete its file.
    #[delete]
    async fn delete(&self, id: i64) -> Result<(), Error>;
}

#[draad::api]
impl LibraryApi for AppContext {
    async fn list(&self) -> Result<Vec<Book>, Error> {
        books::list(&self.db).await
    }

    async fn get(&self, id: i64) -> Result<Book, Error> {
        books::get(&self.db, id)
            .await?
            .ok_or_else(|| Error::NotFound("book not found".into()))
    }

    async fn delete(&self, id: i64) -> Result<(), Error> {
        if let Some(book) = books::get(&self.db, id).await?
            && !book.file_path.is_empty()
        {
            let _ = tokio::fs::remove_file(self.storage.join(&book.file_path)).await;
        }
        books::delete(&self.db, id).await
    }
}
