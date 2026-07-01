# cms CLI reference

Read this only when SKILL.md doesn't cover the flag or behavior you need.

## Global flags

| Flag               | Description                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `--base-url <url>` | Override `CMS_MCP_BASE_URL` for this invocation. Useful for talking to test vs prod from the same shell. |
| `--help`           | Print help for any command.                                                                              |
| `--version`        | Print CLI version.                                                                                       |

The CLI reads these env vars, in order:

1. `CMS_MCP_BASE_URL` — preferred
2. `PAYLOAD_API_URL` — fallback (kept for parity with the MCP server config)

### Two auth modes

| Mode                                 | When                                                                                                                                                                       | How                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Static API key** (`CMS_API_TOKEN`) | Automation / hub-provisioned. Set `CMS_API_TOKEN` and every command authenticates as `Authorization: users API-Key <key>` — **no `cms login`, no token cache, no expiry**. | `export CMS_API_TOKEN=...` then run any command. `cms status` reports `{ logged_in: true, auth: "api-key" }`. |
| **OAuth** (interactive)              | A human on their own machine.                                                                                                                                              | `cms login` opens a browser, writes a 30-day token to the cache below.                                        |

`CMS_API_TOKEN`, when present, always wins — OAuth is skipped entirely. This is what the `qlj-skills` hub uses: it injects a hub-provisioned key so nobody runs `cms login`.

Token cache (OAuth mode only) lives at `${XDG_CONFIG_HOME:-$HOME/.config}/playload-cms-mcp/token.json` with file mode `0600` and dir mode `0700`. The CLI refuses to read a token from a directory that's group- or world-accessible.

### Provisioning a static API key

The key is a Payload-native API key on the `users` collection (`auth.useAPIKey: true`):

1. In the admin UI, create or open a service account user (e.g. `cms-bot@deepclick.com`).
2. Tick **Enable API Key** and save — Payload generates a key that does not expire.
3. Store that key as the `CMS_API_TOKEN` secret. Rotate by regenerating the key; revoke by un-ticking Enable API Key.

## Commands

### Authentication

| Command      | What it does                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `cms login`  | Opens browser, completes OAuth Authorization Code + PKCE flow, writes token to cache (TTL 30 days). |
| `cms logout` | Deletes the cached token file.                                                                      |
| `cms status` | Prints `{ logged_in, tokenFile, expires_at, remaining_seconds }`. Exits 0 even when not logged in.  |
| `cms whoami` | GET `/api/users/me`. Fails if not logged in.                                                        |

### Posts

| Command                                                                                                | Notes                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cms post list [--status draft\|published] [--locale en\|zh] [--limit N=20] [--page N=1] [--search Q]` | `--search` matches `title` with `like`.                                                                                                                  |
| `cms post get <idOrSlug> [--locale L]`                                                                 | Slug is resolved to id with one extra GET. Numeric strings are treated as ids.                                                                           |
| `cms post create --file <md> [--locale L] [--data '<json>']`                                           | Markdown can also come from stdin if `--file` is omitted. `--data` accepts any blogPosts field (title, slug, excerpt, category, coverImage, status, ...). |
| `cms post update <idOrSlug> [--file <md>] [--locale L] [--data '<json>']`                              | Writes scoped to `--locale`. Omit `--file` to skip body update.                                                                                          |
| `cms post publish <idOrSlug>`                                                                          | PATCH `_status: published`.                                                                                                                              |
| `cms post unpublish <idOrSlug>`                                                                        | PATCH `_status: draft`.                                                                                                                                  |

### Media

| Command                                      | Notes                                                               |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `cms media list [--limit N=20] [--page N=1]` | Sorted by `-createdAt`.                                             |
| `cms media upload <path> [--alt <text>]`     | Path must resolve under `$HOME`. `--alt` defaults to file basename. |

### Categories

| Command                                          | Notes |
| ------------------------------------------------ | ----- |
| `cms category list [--locale L] [--limit N=100]` |       |

### Generic

| Command                         | Notes                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cms call <tool> '<json-args>'` | Forwards to any of the 10 tools verbatim. Use this for filters / fields the named subcommands don't expose.                                          |
| `cms preprocess <file>`         | Reads a markdown file, uploads inline local images, prints rewritten body to stdout. Useful for sanity-checking the image-rewrite step in isolation. |

## Tool catalog (also available via MCP)

These are the underlying tools the CLI wraps. Each is callable via `cms call <name> '<json>'` or as an MCP `tools/call` request.

### `whoami`

Args: `{}`
Returns: the authenticated user document.

### `category_list`

Args: `{ locale?: string, limit?: number = 100 }`

### `media_list`

Args: `{ limit?: number = 20, page?: number = 1 }`

### `media_upload`

Args: `{ path: string, alt?: string }`
Path is resolved against `cwd` and validated to live under `$HOME`. Returns `{ id, url }`.

### `post_list`

Args:

```json
{
  "status": "draft" | "published",
  "locale": "en",
  "limit": 20,
  "page": 1,
  "search": "title fragment"
}
```

Search maps to `where[title][like]`.

### `post_get`

Args: `{ id?: string|number, slug?: string, locale?: string }`. Always fetches drafts (`draft=true&depth=0`).

### `post_create`

Args:

```json
{
  "markdown": "...",
  "locale": "en",
  "data": { "title": "...", "slug": "...", "category": 3, "coverImage": 12, "excerpt": "..." }
}
```

`title`, `slug`, `category`, and `coverImage` are required for create. `coverImageId` is accepted as a backwards-compatible alias for `coverImage`. Inline relative images are uploaded and rewritten before the create call.

### `post_update`

Args:

```json
{
  "id": 42,
  "markdown": "optional",
  "locale": "en",
  "data": { "excerpt": "..." }
}
```

Either `markdown` or `data` (or both) must be present.

### `post_publish` / `post_unpublish`

Args: `{ id?: string|number, slug?: string }`. Sets `_status` to `published` / `draft`.

## Error envelope

The CLI exits non-zero and prints the Payload error message to stderr. Validation errors come through with field paths intact:

```
$ cms post create --file empty.md --locale en --data '{}'
400: title: Required; slug: Required
```

Read the message — Payload tells you exactly what's wrong.
