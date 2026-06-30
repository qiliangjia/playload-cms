import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// 开启 users collection 的 Payload 原生 API Key（auth.useAPIKey）后新增的三列。
// 手写而非 migrate:create 生成：当前 schema 快照已与本地 dev DB 漂移，
// migrate:create 会把无关的 categories/doc_pages 改动一并卷进来。这里只精确地
// 给 users 表补 API Key 所需列。
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`enable_api_key\` integer;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`api_key\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`api_key_index\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`api_key_index\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`api_key\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`enable_api_key\`;`)
}
