import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`blog_posts\` ADD \`category\` text DEFAULT 'industry-info' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`blog_posts\` ADD \`featured\` integer DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`blog_posts\` DROP COLUMN \`category\`;`)
  await db.run(sql`ALTER TABLE \`blog_posts\` DROP COLUMN \`featured\`;`)
}
