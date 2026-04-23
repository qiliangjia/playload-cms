import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`oauth_codes\` (
    \`code\` text PRIMARY KEY NOT NULL,
    \`user_id\` integer NOT NULL,
    \`code_challenge\` text NOT NULL,
    \`code_challenge_method\` text NOT NULL,
    \`redirect_uri\` text NOT NULL,
    \`expires_at\` integer NOT NULL,
    \`consumed\` integer DEFAULT 0 NOT NULL
  );`)
  await db.run(
    sql`CREATE INDEX \`oauth_codes_expires_at_idx\` ON \`oauth_codes\` (\`expires_at\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`oauth_codes_expires_at_idx\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`oauth_codes\`;`)
}
