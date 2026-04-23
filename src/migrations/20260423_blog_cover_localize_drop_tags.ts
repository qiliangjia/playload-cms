import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Localize blogPosts.coverImage and drop the unused tags field.
//
// Why we DON'T drop blog_posts.cover_image_id (the old shared column):
// Cloudflare D1 enforces foreign_keys globally and ignores
// `PRAGMA foreign_keys=OFF`, so the standard SQLite table-swap pattern
// can't be made safe here — `DROP TABLE blog_posts` would cascade
// through ON DELETE CASCADE on blog_posts_locales._parent_id and wipe
// every localized post. We learned that the hard way: the first deploy
// attempt did exactly that and had to be restored via D1 time travel.
//
// Leaving the column in place is harmless: Payload's drizzle schema,
// generated from the collection config, no longer references
// blog_posts.cover_image_id (coverImage is now `localized: true` and
// lives under blog_posts_locales.cover_image_id). The orphan column
// carries the pre-migration data but nobody reads it.

async function columnExists(
  db: MigrateUpArgs['db'],
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`);`))) as Array<{
    name: string
  }>
  return rows.some((row) => row.name === column)
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1) Add the localized cover_image_id column to blog_posts_locales
  //    (idempotent — earlier deploy attempts may have added it already).
  if (!(await columnExists(db, 'blog_posts_locales', 'cover_image_id'))) {
    await db.run(
      sql`ALTER TABLE \`blog_posts_locales\` ADD COLUMN \`cover_image_id\` integer REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
    )
  }
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`blog_posts_locales_cover_image_idx\` ON \`blog_posts_locales\` (\`cover_image_id\`);`,
  )

  // 2) Seed every existing locale row with the previously-shared cover so
  //    nothing loses its image. Only rows still missing a cover get
  //    updated, so re-running is safe.
  await db.run(sql`UPDATE \`blog_posts_locales\`
    SET \`cover_image_id\` = (
      SELECT \`cover_image_id\` FROM \`blog_posts\` WHERE \`id\` = \`blog_posts_locales\`.\`_parent_id\`
    )
    WHERE \`cover_image_id\` IS NULL;`)

  // 3) Drop the unused tags table. DROP TABLE blog_posts_tags only
  //    removes rows from blog_posts_tags itself — no other table has a
  //    FK pointing at it, so there's no cascade concern.
  await db.run(sql`DROP TABLE IF EXISTS \`blog_posts_tags\`;`)

  // NOTE: blog_posts.cover_image_id is intentionally left in place (see
  // header comment). A future migration can remove it once a safe FK-
  // detaching strategy is available on D1.
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop the localized cover_image_id column. blog_posts_locales isn't
  // referenced as a parent by any other table, so DROP COLUMN on a FK
  // column is fine — SQLite 3.35+ supports it as long as nothing
  // depends on the column.
  await db.run(sql`DROP INDEX IF EXISTS \`blog_posts_locales_cover_image_idx\`;`)
  await db.run(sql`ALTER TABLE \`blog_posts_locales\` DROP COLUMN \`cover_image_id\`;`)

  // Recreate tags table (original data is lost — it was already 0 rows
  // on prod at deploy time, so this is effectively a no-op for data).
  await db.run(sql`CREATE TABLE \`blog_posts_tags\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`tag\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX \`blog_posts_tags_order_idx\` ON \`blog_posts_tags\` (\`_order\`);`)
  await db.run(
    sql`CREATE INDEX \`blog_posts_tags_parent_id_idx\` ON \`blog_posts_tags\` (\`_parent_id\`);`,
  )
}
