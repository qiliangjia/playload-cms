import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Idempotent: the first attempt to run this migration failed at the final
// DROP COLUMN step (D1 SQLite refuses to drop a column that still has an
// FK constraint), so the ADD COLUMN / CREATE INDEX / UPDATE / DROP INDEX
// steps have already been committed on prod. Running again needs to be a
// no-op for the prefix and succeed on the rest.

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
  // 1) Localize blogPosts.coverImage into blog_posts_locales.
  if (!(await columnExists(db, 'blog_posts_locales', 'cover_image_id'))) {
    await db.run(
      sql`ALTER TABLE \`blog_posts_locales\` ADD COLUMN \`cover_image_id\` integer REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
    )
  }
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`blog_posts_locales_cover_image_idx\` ON \`blog_posts_locales\` (\`cover_image_id\`);`,
  )

  // Only seed rows that still miss a cover. Safe to re-run — WHERE skips
  // rows already populated on a prior attempt.
  await db.run(sql`UPDATE \`blog_posts_locales\`
    SET \`cover_image_id\` = (
      SELECT \`cover_image_id\` FROM \`blog_posts\` WHERE \`id\` = \`blog_posts_locales\`.\`_parent_id\`
    )
    WHERE \`cover_image_id\` IS NULL;`)

  // 2) Drop blog_posts.cover_image_id via table swap. SQLite can't DROP
  //    COLUMN on a column that still carries a FOREIGN KEY constraint,
  //    and we MUST wrap the swap in PRAGMA foreign_keys=OFF/ON — otherwise
  //    DROP TABLE blog_posts cascades through ON DELETE CASCADE on
  //    blog_posts_locales._parent_id and wipes every translated post.
  //    Same pattern as migrations/20260421_032944_authors_and_refactor.ts.
  if (await columnExists(db, 'blog_posts', 'cover_image_id')) {
    await db.run(sql`DROP INDEX IF EXISTS \`blog_posts_cover_image_idx\`;`)
    await db.run(sql`PRAGMA foreign_keys=OFF;`)
    await db.run(sql`CREATE TABLE \`__new_blog_posts\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`status\` text DEFAULT 'draft' NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`author_id\` integer REFERENCES \`authors\`(\`id\`),
      \`featured\` integer DEFAULT false,
      \`category_id\` integer REFERENCES \`categories\`(\`id\`),
      \`publish_date\` text
    );`)
    await db.run(sql`INSERT INTO \`__new_blog_posts\`
      (\`id\`, \`status\`, \`updated_at\`, \`created_at\`, \`author_id\`, \`featured\`, \`category_id\`, \`publish_date\`)
      SELECT \`id\`, \`status\`, \`updated_at\`, \`created_at\`, \`author_id\`, \`featured\`, \`category_id\`, \`publish_date\`
      FROM \`blog_posts\`;`)
    await db.run(sql`DROP TABLE \`blog_posts\`;`)
    await db.run(sql`ALTER TABLE \`__new_blog_posts\` RENAME TO \`blog_posts\`;`)
    await db.run(sql`PRAGMA foreign_keys=ON;`)
    await db.run(
      sql`CREATE INDEX \`blog_posts_updated_at_idx\` ON \`blog_posts\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`blog_posts_created_at_idx\` ON \`blog_posts\` (\`created_at\`);`,
    )
    await db.run(sql`CREATE INDEX \`blog_posts_author_idx\` ON \`blog_posts\` (\`author_id\`);`)
    await db.run(sql`CREATE INDEX \`blog_posts_category_idx\` ON \`blog_posts\` (\`category_id\`);`)
  }

  // 3) Drop the unused tags table.
  await db.run(sql`DROP TABLE IF EXISTS \`blog_posts_tags\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Restore shared cover_image_id. Prefer en's value when collapsing.
  await db.run(
    sql`ALTER TABLE \`blog_posts\` ADD COLUMN \`cover_image_id\` integer REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX \`blog_posts_cover_image_idx\` ON \`blog_posts\` (\`cover_image_id\`);`,
  )
  await db.run(sql`UPDATE \`blog_posts\`
    SET \`cover_image_id\` = COALESCE(
      (SELECT \`cover_image_id\` FROM \`blog_posts_locales\`
        WHERE \`_parent_id\` = \`blog_posts\`.\`id\` AND \`_locale\` = 'en'),
      (SELECT \`cover_image_id\` FROM \`blog_posts_locales\`
        WHERE \`_parent_id\` = \`blog_posts\`.\`id\` AND \`_locale\` = 'zh-CN')
    );`)

  await db.run(sql`DROP INDEX IF EXISTS \`blog_posts_locales_cover_image_idx\`;`)
  await db.run(sql`ALTER TABLE \`blog_posts_locales\` DROP COLUMN \`cover_image_id\`;`)

  // Recreate empty tags table (original values not recoverable).
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
