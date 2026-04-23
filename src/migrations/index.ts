import * as migration_20250929_111647 from './20250929_111647'
import * as migration_20260420_113232 from './20260420_113232'
import * as migration_20260421_032944_authors_and_refactor from './20260421_032944_authors_and_refactor'
import * as migration_20260421_061207_add_blog_category_featured from './20260421_061207_add_blog_category_featured'
import * as migration_20260422_categories_and_publish_date from './20260422_categories_and_publish_date'
import * as migration_20260422_114105_remove_doc_pages from './20260422_114105_remove_doc_pages'
import * as migration_20260422_150734_flatten_category_locale from './20260422_150734_flatten_category_locale'
import * as migration_20260422_mcp_oauth_codes from './20260422_mcp_oauth_codes'
import * as migration_20260423_blog_cover_localize_drop_tags from './20260423_blog_cover_localize_drop_tags'

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260420_113232.up,
    down: migration_20260420_113232.down,
    name: '20260420_113232',
  },
  {
    up: migration_20260421_032944_authors_and_refactor.up,
    down: migration_20260421_032944_authors_and_refactor.down,
    name: '20260421_032944_authors_and_refactor',
  },
  {
    up: migration_20260421_061207_add_blog_category_featured.up,
    down: migration_20260421_061207_add_blog_category_featured.down,
    name: '20260421_061207_add_blog_category_featured',
  },
  {
    up: migration_20260422_categories_and_publish_date.up,
    down: migration_20260422_categories_and_publish_date.down,
    name: '20260422_categories_and_publish_date',
  },
  {
    up: migration_20260422_114105_remove_doc_pages.up,
    down: migration_20260422_114105_remove_doc_pages.down,
    name: '20260422_114105_remove_doc_pages',
  },
  {
    up: migration_20260422_150734_flatten_category_locale.up,
    down: migration_20260422_150734_flatten_category_locale.down,
    name: '20260422_150734_flatten_category_locale',
  },
  {
    up: migration_20260422_mcp_oauth_codes.up,
    down: migration_20260422_mcp_oauth_codes.down,
    name: '20260422_mcp_oauth_codes',
  },
  {
    up: migration_20260423_blog_cover_localize_drop_tags.up,
    down: migration_20260423_blog_cover_localize_drop_tags.down,
    name: '20260423_blog_cover_localize_drop_tags',
  },
]
