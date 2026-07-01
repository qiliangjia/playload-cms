import fs from 'node:fs/promises'
import cac from 'cac'
import { apiKeyFromEnv, resolveConfig } from './config.js'
import { rewriteInlineImages } from './markdown.js'
import { ensureToken, loginFlow } from './oauth.js'
import { makeClient, PayloadError } from './payloadClient.js'
import { clearToken, readToken } from './tokenCache.js'
import { buildTools, type ToolDef } from './tools.js'
import { VERSION } from './version.js'

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
  return { cfg, client: makeClient(cfg, ensureToken) }
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
        if (apiKeyFromEnv()) {
          print({ logged_in: true, auth: 'api-key', source: 'CMS_API_TOKEN' })
          return
        }
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

  // cac (6.x) matches a command by its FIRST token only, so space-nested names
  // like `post list` never match — it sees `post` and falls through. Model each
  // group as a single `<group> <action>` command with a positional action and
  // dispatch internally, which preserves the documented `cms post list` UX.
  cli
    .command('post <action> [idOrSlug]', 'Posts: list | get | create | update | publish | unpublish')
    .option('--status <status>', 'list: draft | published')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .option('--limit <n>', 'list: page size', { default: 20 })
    .option('--page <n>', 'list: page number', { default: 1 })
    .option('--search <q>', 'list: title contains')
    .option('--file <path>', 'create/update: markdown file (create reads stdin if omitted)')
    .option('--data <json>', 'create/update: extra blogPosts fields as JSON')
    .action(async (action: string, idOrSlug: string | undefined, opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        const needId = (verb: string) => {
          if (!idOrSlug) throw new Error(`usage: cms post ${verb} <idOrSlug>`)
          return idOrSlug
        }
        switch (action) {
          case 'list':
            return print(
              await findTool('post_list').handler(
                {
                  status: opts.status,
                  locale: opts.locale,
                  limit: Number(opts.limit),
                  page: Number(opts.page),
                  search: opts.search,
                },
                { client },
              ),
            )
          case 'get':
            return print(
              await findTool('post_get').handler({ id: needId('get'), locale: opts.locale }, { client }),
            )
          case 'create': {
            const markdown = opts.file ? await fs.readFile(String(opts.file), 'utf8') : await readStdin()
            if (!markdown.trim()) throw new Error('markdown body is empty')
            return print(
              await findTool('post_create').handler(
                { markdown, locale: opts.locale, data: opts.data ? JSON.parse(String(opts.data)) : undefined },
                { client },
              ),
            )
          }
          case 'update': {
            const id = needId('update')
            const markdown = opts.file ? await fs.readFile(String(opts.file), 'utf8') : undefined
            return print(
              await findTool('post_update').handler(
                { id, markdown, locale: opts.locale, data: opts.data ? JSON.parse(String(opts.data)) : undefined },
                { client },
              ),
            )
          }
          case 'publish':
            return print(await findTool('post_publish').handler({ id: needId('publish') }, { client }))
          case 'unpublish':
            return print(await findTool('post_unpublish').handler({ id: needId('unpublish') }, { client }))
          default:
            throw new Error(`unknown post action: ${action} (use list|get|create|update|publish|unpublish)`)
        }
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('media <action> [path]', 'Media: list | upload <path>')
    .option('--alt <text>', 'upload: alt text; defaults to file name')
    .option('--limit <n>', 'list: page size', { default: 20 })
    .option('--page <n>', 'list: page number', { default: 1 })
    .action(async (action: string, filePath: string | undefined, opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        switch (action) {
          case 'list':
            return print(
              await findTool('media_list').handler(
                { limit: Number(opts.limit), page: Number(opts.page) },
                { client },
              ),
            )
          case 'upload':
            if (!filePath) throw new Error('usage: cms media upload <path>')
            return print(await findTool('media_upload').handler({ path: filePath, alt: opts.alt }, { client }))
          default:
            throw new Error(`unknown media action: ${action} (use list|upload)`)
        }
      } catch (err) {
        fail(err)
      }
    })

  cli
    .command('category <action>', 'Categories: list')
    .option('--locale <locale>', 'CMS locale (e.g. en, zh)')
    .option('--limit <n>', '', { default: 100 })
    .action(async (action: string, opts: CommonOpts & Record<string, unknown>) => {
      try {
        const { client } = buildClient(opts)
        switch (action) {
          case 'list':
            return print(
              await findTool('category_list').handler(
                { locale: opts.locale, limit: Number(opts.limit) },
                { client },
              ),
            )
          default:
            throw new Error(`unknown category action: ${action} (use list)`)
        }
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
  cli.version(VERSION)
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
