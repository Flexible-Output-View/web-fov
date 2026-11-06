-- Drop existing tables
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS stream_settings;
DROP TABLE IF EXISTS streams;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;

-- Table structure for categories
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  viewers INTEGER NOT NULL CHECK (viewers >= 0),
  image_url VARCHAR(255) NOT NULL
);

-- Insert data into categories
INSERT INTO categories (id, name, viewers, image_url) VALUES
(1, 'League of Legends', 125000, 'assets/category/leagues-of-legends.png'),
(2, 'Just Chatting', 98000, 'assets/category/just-chatting.png'),
(3, 'Valorant', 87000, 'assets/category/valorant.png'),
(4, 'Fortnite', 76000, 'assets/category/fortnite.png'),
(5, 'Minecraft', 65000, 'assets/category/minecraft.png'),
(6, 'Music', 0, 'assets/category/music.png');

-- Table structure for users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  bio VARCHAR(300) NOT NULL DEFAULT '',
  avatar_url TEXT,
  banner_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (LOWER(email));

-- Table structure for follows (follower -> following)
CREATE TABLE follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX idx_follows_following_id ON follows (following_id);

-- Per-user stream configuration (title, description, visibility, thumbnail)
-- and the backend-generated stream key used by the ingest pipeline.
CREATE TABLE stream_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stream_key VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL DEFAULT '',
  description VARCHAR(2000) NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  thumbnail_url TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_stream_visibility CHECK (visibility IN ('public', 'unlisted', 'private'))
);

CREATE INDEX idx_stream_settings_category_id ON stream_settings (category_id);

-- Table structure for streams
CREATE TABLE streams (
  id SERIAL PRIMARY KEY,
  streamer VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category_id INTEGER NOT NULL,
  viewers INTEGER NOT NULL CHECK (viewers >= 0),
  thumbnail_url VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255) NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_stream_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_streams_category_id ON streams(category_id);

-- Sync auto-increment sequence counters
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE(MAX(id), 1)) FROM categories;
SELECT setval(pg_get_serial_sequence('streams', 'id'), COALESCE(MAX(id), 1)) FROM streams;
