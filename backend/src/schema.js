import db from './db.js';

/**
 * Idempotent schema migration for the profile feature.
 *
 * `fovwebdb.sql` is the source of truth for fresh databases, but Postgres only
 * runs it when the data volume is first initialised. This function makes sure
 * an already-running database also gets the profile columns and the `follows`
 * table, without requiring the volume to be recreated.
 */
export async function ensureSchema() {
    await db.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS bio VARCHAR(300) NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS avatar_url TEXT,
            ADD COLUMN IF NOT EXISTS banner_url TEXT,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS follows (
            follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (follower_id, following_id),
            CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id)
        )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows (following_id)');
}

export default ensureSchema;
