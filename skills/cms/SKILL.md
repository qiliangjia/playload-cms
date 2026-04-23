---
name: cms
description: Use this skill whenever the user wants to write, edit, publish, list, or roll back a DeepClick blog post, manage blog categories, or upload images to the CMS — and whenever the user mentions "blog", "post", "草稿", "发文章", "deepclick cms", "Payload", or asks Claude to push content to the marketing site. Always prefer this skill (which drives the `cms` CLI) over hand-rolling REST calls, because the CLI persists login across sessions and surfaces Payload's field-level validation errors verbatim.
---

# DeepClick CMS

This skill drives the DeepClick Payload CMS through the `cms` CLI. The CLI is a thin wrapper over the same OAuth + REST flow used by the `cms-mcp` MCP server, so behavior is identical whether the user is on Claude Code with the MCP registered or on a vanilla shell.

Use the CLI for content workflows. Reach for the Payload admin UI only when the user explicitly wants to click around.

## Setup check (run once at session start)

```bash
cms --version              # 0.1.0+ proves it's installed
cms status                 # logged_in: true is required for everything below
```

If `cms` is missing, ask the user (don't try to install silently — they may want to pin a version):
```bash
npm i -g @deepclick/cms-mcp
```

If `logged_in` is `false`, the user must run `cms login` themselves — it opens a browser. Don't run it for them; you'll just hang the session. The token persists 30 days at `~/.config/playload-cms-mcp/token.json`.

## The mental model

A blog post lives in the `blogPosts` collection. Each post has:
- A numeric `id` (stable) and a string `slug` (human-friendly). The CLI accepts either where it expects an identifier.
- Per-locale content (`en`, `zh`). **Writes are scoped by `--locale`** — updating English never touches Chinese. Always pass `--locale` for create and update.
- A `status` field: `draft` or `published`. New posts default to `draft`.
- A markdown body that gets converted to Lexical (Payload's rich text format) on the server.

Inline images in markdown like `![alt](./hero.png)` are uploaded to the `media` collection and rewritten to the stored URL **before** the post is created. Remote URLs (`https://...`, `data:`) are passed through untouched. Image paths must resolve under `$HOME` — a safety guard refuses to read outside it.

## Workflows

### Create a draft from a markdown file
```bash
cms post create --file ./drafts/my-post.md --locale en \
  --data '{"title":"My title","slug":"my-slug","excerpt":"...","category":3}'
```

The response is the created blogPost. **Capture the `id`** so subsequent edits don't need a slug lookup.

If you only have a string in memory, pipe it via stdin:
```bash
echo "# Hello\n\nBody..." | cms post create --locale en --data '{"title":"Hello","slug":"hello"}'
```

### Update an existing post (English only, leaving Chinese alone)
```bash
cms post update my-slug --file ./drafts/my-post.md --locale en
cms post update 42 --data '{"excerpt":"new excerpt"}' --locale en
```

You can pass `--file`, `--data`, or both. Omit `--file` to skip body update.

### Publish / unpublish
```bash
cms post publish my-slug
cms post unpublish my-slug
```

### Discover what exists
```bash
cms post list --status draft --limit 10
cms post list --search "hero"
cms post get my-slug --locale en
cms category list --locale en
cms media list
```

### Upload one image (without creating a post)
```bash
cms media upload ./hero.png --alt "Hero shot for the Q2 launch"
```

### Escape hatch: call any tool by name
The CLI is a friendly facade over a 10-tool catalog. If you need a flag the CLI doesn't expose, fall through:
```bash
cms call post_list '{"status":"draft","where":{"category":{"equals":3}}}'
```
The full tool catalog and JSON-schema is in `references/cli-reference.md`.

## Common failure modes

- **`401: Unauthorized`** — token expired. Tell the user to run `cms login`. Don't try to recover automatically.
- **`400: title: Required; slug: Already in use`** — Payload validation. The error message lists the failing fields verbatim — fix the `--data` payload and retry. Slugs must be unique per locale.
- **`outside the user's home directory`** — an image or markdown file resolved outside `$HOME`. Ask the user to move it under `$HOME` or pass an absolute path inside `$HOME`.
- **`unknown tool: X`** — typo in `cms call <tool>`. Valid tools: `whoami`, `category_list`, `media_list`, `media_upload`, `post_list`, `post_get`, `post_create`, `post_update`, `post_publish`, `post_unpublish`.
- **First image upload hangs forever** — the media POST is talking to R2 via the Worker; large files genuinely take time. If it's still going after 30s for a single image, escalate to the user rather than retrying.

## When NOT to use this skill

- The user wants to render the public blog page, fix a Vue component, or change layout → that's the Nuxt frontend (`sitepower-vue-guanwang`), not Payload.
- The user wants to add a field to the `blogPosts` schema → that's a Payload code change in `infra/playload-cms/src/collections/`, not a CMS API call.
- The user wants to deploy the CMS Worker, tweak Cloudflare bindings, or rotate D1 → infrastructure work, out of scope.

## Going deeper

- **Full CLI flag reference + tool catalog with JSON schemas:** `references/cli-reference.md`
- **Markdown / image preprocessing rules and gotchas:** `references/markdown-and-images.md`

Read those only when the SKILL.md text above doesn't cover what you need — they're verbose by design.
