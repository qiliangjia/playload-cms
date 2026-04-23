import fs from 'node:fs/promises'
import cac from 'cac'
import { resolveConfig } from './config.js'
import { rewriteInlineImages } from './markdown.js'
import { ensureToken, loginFlow } from './oauth.js'
import { PayloadClient, PayloadError } from './payloadClient.js'
import { clearToken, readToken } from './tokenCache.js'
import { buildTools, type ToolDef } from './tools.js'

const print = (value: unknown): void => {
  if (value === undefined) return
  if (typeof value === 'string') {
    process.stdout.write(`${value}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

const fail = (err: unknown): never => {
  if (err instanceof PayloadError) {
    process.stderr.write(`${err.message}\n`)
  } else if (err instanceof Error) {
    process.stderr.write(`${err.message}\n`)
  } else {
    process.stderr.write(`${String(err)}\n`)
  }
  process.exit(1)
}

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

interface CommonOpts {
  baseUrl?: string
}

const buildClient = (opts: CommonOpts) => {
  const env = opts.baseUrl ? { ...process.env, CMS_MCP_BASE_URL: opts.baseUrl } : process.env
  const cfg = resolveConfig(env)
  return { cfg, client: new PayloadClient(cfg, () => ensureToken(cfg)) }
}

const findTool = (name: string): ToolDef => {
  const tool = buildTools(process.cwd()).find((t) => t.name === name)
  if (!tool) throw new Error(`unknown tool: ${name}`)
  return tool
}

export const buildCli = () => {
  const cli = cac('cms')

  cli.option('--base-url <url>', 'Override CMS_MCP_BASE_URL for this invocation')

  cli
    .command('login', 'Run the OAuth flow and persist a token to the local cache.')
    .action(async (opts: CommonOpts) => {
      try {
        const { cfg } = buildClient(opts)
        const tok = await loginFlow(cfg)
        const expiresIn = tok.expires_at - Math.floor(Date.now() / 1000)
        print({ ok: true, tokenFile: cfg.tokenFile, expires_in_seconds: expiresIn })
      } catch (err) {
        fail(err)
      }
    })

  cli.command('logout', 'Delete the cached token.').action(async (opts: CommonOpts) => {
    try {
      const { cfg } = buildClient(opts)
      await clearToken(cfg)
      print({ ok: true, removed: cfg.tokenFile })
    } catch (err) {
      fail(err)
    }
  })

  cli
    .command('status', 'Show whether a cached token is present and how long it is valid for.')
    .action(async (opts: CommonOpts) => {
      try {
        const { cfg } = buildClient(opts)
        const cached = await readToken(cfg)
        if (!cached) {
          print({ logged_in: false, tokenFile: cfg.tokenFile })
          return
        }
        const remaining = cached.expires_at - Math.floor(Date.now() / 1000)
        print({
          logged_in: remaining > 0,
          tokenFile: cfg.tokenFile,
          expires_at: new Date(cached.expires_at * 1000).toISOString(),
          remaining_seconds: remaining,
        })
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('whoami', 'Print the currently authenticated CMS user.')
    .action(async (opts: CommonOpts) => {
      try {
        const { client } = buildClient(opts)
        print(await findTool('whoami').handler({}, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('call <tool> [json]', 'Call any MCP tool by name with a JSON args object.')
    .example('  cms call post_list \'{"status":"draft","limit":5}\'')
    .action(async (tool: string, json: string | undefined, opts: CommonOpts) => {
      try {
        const args = json ? (JSON.parse(json) as Record<string, unknown>) : {}
        const { client } = buildClient(opts)
        print(await findTool(tool).handler(args, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('post list', 'List blog posts.')
    .option('--status <status>', 'draft | published')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .option('--limit <n>', '', { default: 20 })
    .option('--page <n>', '', { default: 1 })
    .option('--search <q>', 'Title contains')
    .action(async (opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        const args: Record<string, unknown> = {
          status: opts.status,
          locale: opts.locale,
          limit: Number(opts.limit),
          page: Number(opts.page),
          search: opts.search,
        }
        print(await findTool('post_list').handler(args, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('post get <idOrSlug>', 'Fetch one blog post by id or slug.')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .action(async (idOrSlug: string, opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        print(await findTool('post_get').handler({ id: idOrSlug, locale: opts.locale }, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('post create', 'Create a blog post from a markdown file or stdin.')
    .option('--file <path>', 'Markdown file; if omitted, read from stdin.')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .option('--data <json>', 'Extra blogPosts fields as JSON.')
    .action(async (opts: CommonOpts & Record<string, unknown>) => {
      try {
        const markdown = opts.file
          ? await fs.readFile(String(opts.file), 'utf8')
          : await readStdin()
        if (!markdown.trim()) throw new Error('markdown body is empty')
        const { client } = buildClient(opts)
        const args = {
          markdown,
          locale: opts.locale,
          data: opts.data ? JSON.parse(String(opts.data)) : undefined,
        }
        print(await findTool('post_create').handler(args, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('post update <idOrSlug>', 'Update a blog post (markdown and/or data patch).')
    .option('--file <path>', 'Markdown file; omit to skip body update.')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .option('--data <json>', 'Partial blogPosts patch as JSON.')
    .action(async (idOrSlug: string, opts: CommonOpts & Record<string, unknown>) => {
      try {
        const markdown = opts.file ? await fs.readFile(String(opts.file), 'utf8') : undefined
        const { client } = buildClient(opts)
        const args = {
          id: idOrSlug,
          markdown,
          locale: opts.locale,
          data: opts.data ? JSON.parse(String(opts.data)) : undefined,
        }
        print(await findTool('post_update').handler(args, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('post publish <idOrSlug>', 'Publish a blog post.')
    .action(async (idOrSlug: string, opts: CommonOpts) => {
      try {
        const { client } = buildClient(opts)
        print(await findTool('post_publish').handler({ id: idOrSlug }, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('post unpublish <idOrSlug>', 'Unpublish a blog post (back to draft).')
    .action(async (idOrSlug: string, opts: CommonOpts) => {
      try {
        const { client } = buildClient(opts)
        print(await findTool('post_unpublish').handler({ id: idOrSlug }, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('media upload <path>', 'Upload a local file to the media collection.')
    .option('--alt <text>', 'Alt text; defaults to file name.')
    .action(async (filePath: string, opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        print(await findTool('media_upload').handler({ path: filePath, alt: opts.alt }, { client }))
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('media list', 'List recent media assets.')
    .option('--limit <n>', '', { default: 20 })
    .option('--page <n>', '', { default: 1 })
    .action(async (opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        print(
          await findTool('media_list').handler(
            { limit: Number(opts.limit), page: Number(opts.page) },
            { client },
          ),
        )
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('category list', 'List blog categories.')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .option('--limit <n>', '', { default: 100 })
    .action(async (opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        print(
          await findTool('category_list').handler(
            { locale: opts.locale, limit: Number(opts.limit) },
            { client },
          ),
        )
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('preprocess <file>', 'Read markdown, upload local images, and print rewritten body.')
    .action(async (filePath: string, opts: CommonOpts) => {
      try {
        const md = await fs.readFile(filePath, 'utf8')
        const { client } = buildClient(opts)
        const out = await rewriteInlineImages(md, process.cwd(), client)
        process.stdout.write(out)
      } catch (err) {
        fail(err)
      }
    })

  cli.help()
  cli.version('0.1.0')
  return cli
}

export const runCli = (argv: string[] = process.argv): void => {
  const cli = buildCli()
  try {
    cli.parse(argv)
  } catch (err) {
    fail(err)
  }
}
