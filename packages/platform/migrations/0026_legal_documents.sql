CREATE TABLE platform_legal_documents (
 kind TEXT NOT NULL CHECK(kind IN ('terms','privacy')),
 locale TEXT NOT NULL CHECK(locale IN ('en','zh-Hans')),
 title TEXT NOT NULL,
 markdown TEXT NOT NULL,
 effective_on TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(kind,locale)
);
