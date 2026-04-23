import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Localize blogPosts.coverImage: move cover_image_id from blog_posts to
  // blog_posts_locales and seed every EXISTING locale row with the old
  // shared value so no post loses its cover at deploy time. Single-locale
  // posts stay single-locale; editors can diverge the covers afterwards.
  await db.run(
    sql`ALTER TABLE \`blog_posts_locales\` ADD COLUMN \`cover_image_id\` integer REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX \`blog_posts_locales_cover_image_idx\` ON \`blog_posts_locales\` (\`cover_image_id\`);`,
  )

  await db.run(sql`UPDATE \`blog_posts_locales\`
    SET \`cover_image_id\` = (
      SELECT \`cover_image_id\` FROM \`blog_posts\` WHERE \`id\` = \`blog_posts_locales\`.\`_parent_id\`
    );`)

  await db.run(sql`DROP INDEX IF EXISTS \`blog_posts_cover_image_idx\`;`)
  await db.run(sql`ALTER TABLE \`blog_posts\` DROP COLUMN \`cover_image_id\`;`)

  // Drop the blogPosts.tags field and its companion table — the frontend
  // never rendered tags, and keeping the table adds CMS clutter.
  await db.run(sql`DROP TABLE IF EXISTS \`blog_posts_tags\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Restore the shared cover_image_id column. Prefer en's value when
  // collapsing two per-locale covers back into one.
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

  // Recreate tags table (original data is lost).
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
