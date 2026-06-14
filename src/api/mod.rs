pub mod health;
pub mod library;

// draad emits `use crate::api::<module>::*` for every module that hosts `#[ty]`
// wire types. `Book` lives at the crate root (`crate::books`), so re-export the
// module here to make `crate::api::books` resolve during codegen.
pub(crate) use crate::books;
