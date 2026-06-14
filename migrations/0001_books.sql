CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT 'epub',
    added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
