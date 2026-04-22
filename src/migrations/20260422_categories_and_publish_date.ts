import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // 1. Create categories table
  await db.run(sql`CREATE TABLE \`categories\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`slug\` text NOT NULL,
    \`order\` numeric DEFAULT 0,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)
  await db.run(sql`CREATE INDEX \`categories_slug_idx\` ON \`categories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`categories_updated_at_idx\` ON \`categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`categories_created_at_idx\` ON \`categories\` (\`created_at\`);`)

  // 2. Create categories_locales table (for localized `title`)
  await db.run(sql`CREATE TABLE \`categories_locales\` (
    \`title\` text NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`_locale\` text NOT NULL,
    \`_parent_id\` integer NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(
    sql`CREATE UNIQUE INDEX \`categories_locales_locale_parent_id_unique\` ON \`categories_locales\` (\`_locale\`,\`_parent_id\`);`,
  )

  // 3. Seed 4 initial categories (ids match the previous select-field slugs)
  await db.run(
    sql`INSERT INTO \`categories\` (\`id\`, \`slug\`, \`order\`) VALUES (1, 'brand-news', 0);`,
  )
  await db.run(
    sql`INSERT INTO \`categories\` (\`id\`, \`slug\`, \`order\`) VALUES (2, 'product-tutorial', 1);`,
  )
  await db.run(
    sql`INSERT INTO \`categories\` (\`id\`, \`slug\`, \`order\`) VALUES (3, 'industry-info', 2);`,
  )
  await db.run(
    sql`INSERT INTO \`categories\` (\`id\`, \`slug\`, \`order\`) VALUES (4, 'going-global-events', 3);`,
  )

  // Seed localized titles
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('Brand News', 'en', 1);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('品牌新闻', 'zh-CN', 1);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('Product Tutorial', 'en', 2);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('产品教程', 'zh-CN', 2);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('Industry Info', 'en', 3);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('行业信息', 'zh-CN', 3);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('Going-Global Events', 'en', 4);`,
  )
  await db.run(
    sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`) VALUES ('出海活动', 'zh-CN', 4);`,
  )

  // 4. blog_posts: add category_id FK
  await db.run(
    sql`ALTER TABLE \`blog_posts\` ADD \`category_id\` integer REFERENCES categories(id);`,
  )
  await db.run(sql`CREATE INDEX \`blog_posts_category_idx\` ON \`blog_posts\` (\`category_id\`);`)

  // 5. Migrate existing category (text slug) values to the new FK
  await db.run(
    sql`UPDATE \`blog_posts\` SET \`category_id\` = (SELECT \`id\` FROM \`categories\` WHERE \`slug\` = \`blog_posts\`.\`category\`);`,
  )

  // 6. Drop the legacy category text column
  await db.run(sql`ALTER TABLE \`blog_posts\` DROP COLUMN \`category\`;`)

  // 7. Add publish_date column (optional)
  await db.run(sql`ALTER TABLE \`blog_posts\` ADD \`publish_date\` text;`)

  // 8. payload_locked_documents_rels: add categories_id FK (used by admin locking / rels UI)
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`categories_id\` integer REFERENCES categories(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_categories_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`categories_id\`;`)

  await db.run(sql`ALTER TABLE \`blog_posts\` DROP COLUMN \`publish_date\`;`)

  // Restore legacy category text column and backfill from FK
  await db.run(
    sql`ALTER TABLE \`blog_posts\` ADD \`category\` text DEFAULT 'industry-info' NOT NULL;`,
  )
  await db.run(
    sql`UPDATE \`blog_posts\` SET \`category\` = COALESCE((SELECT \`slug\` FROM \`categories\` WHERE \`id\` = \`blog_posts\`.\`category_id\`), 'industry-info');`,
  )

  await db.run(sql`DROP INDEX IF EXISTS \`blog_posts_category_idx\`;`)
  await db.run(sql`ALTER TABLE \`blog_posts\` DROP COLUMN \`category_id\`;`)

  await db.run(sql`DROP TABLE \`categories_locales\`;`)
  await db.run(sql`DROP TABLE \`categories\`;`)
}
