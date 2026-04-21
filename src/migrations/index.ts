import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260420_113232 from './20260420_113232';
import * as migration_20260421_032944_authors_and_refactor from './20260421_032944_authors_and_refactor';
import * as migration_20260421_061207_add_blog_category_featured from './20260421_061207_add_blog_category_featured';

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
    name: '20260421_061207_add_blog_category_featured'
  },
];
