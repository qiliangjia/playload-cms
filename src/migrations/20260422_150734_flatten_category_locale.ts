import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Add flat columns (nullable at this stage so ALTER succeeds without defaults).
  await db.run(sql`ALTER TABLE \`categories\` ADD COLUMN \`title_zh\` text;`)
  await db.run(sql`ALTER TABLE \`categories\` ADD COLUMN \`title_en\` text;`)

  // 2. Backfill from categories_locales.
  await db.run(sql`UPDATE \`categories\`
    SET \`title_zh\` = (
      SELECT \`title\` FROM \`categories_locales\`
      WHERE \`_parent_id\` = \`categories\`.\`id\` AND \`_locale\` = 'zh-CN'
    );`)
  await db.run(sql`UPDATE \`categories\`
    SET \`title_en\` = (
      SELECT \`title\` FROM \`categories_locales\`
      WHERE \`_parent_id\` = \`categories\`.\`id\` AND \`_locale\` = 'en'
    );`)

  // 3. Fall back missing locale to the other (categories created in one locale only
  //    before this migration would otherwise land with NULL in one column; required: true
  //    in Payload would then block future saves until an editor filled it in).
  await db.run(
    sql`UPDATE \`categories\` SET \`title_en\` = \`title_zh\` WHERE \`title_en\` IS NULL OR \`title_en\` = '';`,
  )
  await db.run(
    sql`UPDATE \`categories\` SET \`title_zh\` = \`title_en\` WHERE \`title_zh\` IS NULL OR \`title_zh\` = '';`,
  )

  // 4. Drop localized title storage.
  await db.run(sql`DROP INDEX IF EXISTS \`categories_locales_locale_parent_id_unique\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`categories_locales\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Recreate categories_locales (schema matches 20260422_categories_and_publish_date).
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

  // Repopulate locales from flat columns.
  await db.run(sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`)
    SELECT \`title_zh\`, 'zh-CN', \`id\` FROM \`categories\` WHERE \`title_zh\` IS NOT NULL;`)
  await db.run(sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`)
    SELECT \`title_en\`, 'en', \`id\` FROM \`categories\` WHERE \`title_en\` IS NOT NULL;`)

  // Drop flat columns.
  await db.run(sql`ALTER TABLE \`categories\` DROP COLUMN \`title_zh\`;`)
  await db.run(sql`ALTER TABLE \`categories\` DROP COLUMN \`title_en\`;`)
}
