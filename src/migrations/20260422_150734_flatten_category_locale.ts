import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Nullable at this stage so ALTER succeeds without defaults.
  await db.run(sql`ALTER TABLE \`categories\` ADD COLUMN \`title_zh\` text;`)
  await db.run(sql`ALTER TABLE \`categories\` ADD COLUMN \`title_en\` text;`)

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

  // Categories created in a single locale before this migration would otherwise
  // land with NULL in one column; required: true in Payload would then block
  // any future save until an editor filled it in.
  await db.run(
    sql`UPDATE \`categories\` SET \`title_en\` = \`title_zh\` WHERE \`title_en\` IS NULL OR \`title_en\` = '';`,
  )
  await db.run(
    sql`UPDATE \`categories\` SET \`title_zh\` = \`title_en\` WHERE \`title_zh\` IS NULL OR \`title_zh\` = '';`,
  )

  await db.run(sql`DROP INDEX IF EXISTS \`categories_locales_locale_parent_id_unique\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`categories_locales\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
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

  await db.run(sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`)
    SELECT \`title_zh\`, 'zh-CN', \`id\` FROM \`categories\` WHERE \`title_zh\` IS NOT NULL;`)
  await db.run(sql`INSERT INTO \`categories_locales\` (\`title\`, \`_locale\`, \`_parent_id\`)
    SELECT \`title_en\`, 'en', \`id\` FROM \`categories\` WHERE \`title_en\` IS NOT NULL;`)

  await db.run(sql`ALTER TABLE \`categories\` DROP COLUMN \`title_zh\`;`)
  await db.run(sql`ALTER TABLE \`categories\` DROP COLUMN \`title_en\`;`)
}
