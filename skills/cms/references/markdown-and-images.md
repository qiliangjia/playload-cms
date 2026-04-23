# Markdown & image preprocessing

The CLI does one piece of work that's worth understanding before debugging weird create/update behavior: it scans the markdown body for inline images, uploads any local files, and rewrites the URLs before sending the markdown to the CMS. This file explains exactly what the regex matches and what the gotchas are.

## What gets matched

The matcher is essentially:
```
/(!\[[^\]]*]\()([^)\s]+)(\s+"[^"]*")?\)/g
```

So:
- `![alt](./local.png)` → matches, uploads local file, rewrites URL
- `![alt](./local.png "title")` → matches, preserves title text in the rewrite
- `![alt](https://cdn.example.com/x.png)` → matches but skipped (passthrough)
- `![alt](data:image/png;base64,...)` → matches but skipped (passthrough)
- `<img src="./local.png">` → **not matched** (HTML img tags are not preprocessed)
- Reference-style `![alt][ref]` + `[ref]: ./img.png` → **not matched** (only inline links)

If you need an HTML `<img>` or reference-style link, upload the file separately with `cms media upload` first and paste the returned URL into your markdown.

## Path resolution

Local references are resolved against `cwd` (the directory where you ran `cms`), not the markdown file's directory. So:

```bash
cd /Users/me/notes
cms post create --file ./posts/launch.md ...
```

Then `![](./hero.png)` inside `posts/launch.md` resolves to `/Users/me/notes/hero.png`, **not** `/Users/me/notes/posts/hero.png`. To avoid surprise, use absolute paths or `cd` into the markdown file's directory before running.

## The $HOME guard

After resolution, every local path is checked: it must live under the current user's home directory. If it doesn't, the CLI exits with:
```
Refusing to read /etc/passwd: path is outside the user's home directory
```

This applies to both inline images and `cms media upload`. To work around it for legitimate cases (e.g., images on a mounted external drive), copy the file under `$HOME` first.

## Deduplication

The same local path referenced multiple times in one markdown body is uploaded **once**, then both references are rewritten to the same URL. So you can safely repeat `![](./logo.png)` throughout a post without paying for N uploads.

## When the rewrite step happens

For `post create` and `post update --file`:
1. Markdown is read (file or stdin).
2. The body is scanned; each unique local image is uploaded to `media` via `POST /api/media`.
3. The body is rewritten with the returned URLs.
4. The rewritten body is POSTed to `/api/cms-mcp/from-markdown` (which converts to Lexical and creates/updates the post).

If step 2 fails (network, auth, R2 outage), the create/update never happens — the upstream POST is gated on all uploads succeeding. So you'll never get a half-created post pointing at broken image paths.

## Sanity-checking the rewrite alone

If you suspect the rewrite is doing something weird, run it in isolation:
```bash
cms preprocess ./posts/launch.md
```
This uploads images and prints the rewritten markdown to stdout, without touching `blogPosts`. Diff against the original to see exactly what changed.

## Server-side enforcement

The `/api/cms-mcp/from-markdown` endpoint also rejects relative URLs server-side as a defense-in-depth check. If you bypass the CLI (e.g., `cms call post_create` with a hand-rolled markdown that still has `./img.png` in it), you'll see:
```
400: markdown contains a relative or local image URL: ./img.png
```
Either preprocess your markdown first or upload the image and inline its absolute URL.
