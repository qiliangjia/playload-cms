import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Drop doc_pages references from payload_locked_documents_rels
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_doc_pages_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`doc_pages_id\`;`)

  // Drop doc pages tables
  await db.run(sql`DROP TABLE IF EXISTS \`doc_pages_locales\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`doc_pages\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Recreate doc_pages + doc_pages_locales (structure from 20260420_113232)
  await db.run(sql`CREATE TABLE \`doc_pages\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`sidebar_order\` numeric,
  	\`related_product\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)
  await db.run(sql`CREATE INDEX \`doc_pages_updated_at_idx\` ON \`doc_pages\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`doc_pages_created_at_idx\` ON \`doc_pages\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`doc_pages_locales\` (
  	\`title\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`content\` text,
  	\`meta_title\` text,
  	\`meta_description\` text,
  	\`meta_image_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`meta_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`doc_pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(
    sql`CREATE INDEX \`doc_pages_slug_idx\` ON \`doc_pages_locales\` (\`slug\`,\`_locale\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`doc_pages_meta_meta_image_idx\` ON \`doc_pages_locales\` (\`meta_image_id\`,\`_locale\`);`,
  )
  await db.run(
    sql`CREATE UNIQUE INDEX \`doc_pages_locales_locale_parent_id_unique\` ON \`doc_pages_locales\` (\`_locale\`,\`_parent_id\`);`,
  )

  // Restore doc_pages_id column on payload_locked_documents_rels
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`doc_pages_id\` integer REFERENCES doc_pages(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_doc_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`doc_pages_id\`);`,
  )
}
