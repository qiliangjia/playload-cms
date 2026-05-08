/**
 * CMS 图片优化 Worker
 *
 * 从 R2 bucket 读取原图，经 CF Image Resizing 做 resize / 格式转换 / 压缩。
 *
 * 请求格式:
 *   GET /<r2-key>?w=800&h=600&q=85&f=auto
 *
 * 参数:
 *   w — width  (1-4096)
 *   h — height (1-4096)
 *   q — quality (1-100, 默认 80)
 *   f — format (auto | webp | avif | json, 默认 auto)
 */

interface Env {
  R2: R2Bucket
}

// Set on the cf.image subrequest so the loopback into this worker returns
// raw R2 bytes instead of trying to transform again (which would recurse).
const PASSTHROUGH_HEADER = 'x-image-passthrough'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?)$/i

const LIMITS = {
  minDim: 1,
  maxDim: 4096,
  minQuality: 1,
  maxQuality: 100,
  defaultQuality: 80,
} as const

type ImageFormat = 'auto' | 'webp' | 'avif' | 'json'
const VALID_FORMATS = new Set<string>(['auto', 'webp', 'avif', 'json'])

function parseIntInRange(val: string | null, min: number, max: number): number | undefined {
  if (!val) return undefined
  const n = parseInt(val, 10)
  if (Number.isNaN(n) || n < min || n > max) return undefined
  return n
}

function parseFormat(val: string | null): ImageFormat {
  if (val && VALID_FORMATS.has(val)) return val as ImageFormat
  return 'auto'
}

function negotiateFormat(accept: string | null): 'webp' | 'avif' | undefined {
  if (!accept) return undefined
  if (accept.includes('image/avif')) return 'avif'
  if (accept.includes('image/webp')) return 'webp'
  return undefined
}

function buildR2Headers(object: R2Object): Headers {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=86400, s-maxage=604800, immutable')
  headers.set('access-control-allow-origin', '*')
  return headers
}

// HTTP 规范里 If-None-Match 的 ETag 必须带引号（可能还有 W/ 弱标记前缀）；
// 但 R2 binding 的 onlyIf.etagDoesNotMatch 不接受引号，传引号会抛
// "Conditional ETag should not be wrapped in quotes" 让整个请求 500。
// 这里剥成裸 hash 再传给 R2。
function parseConditionalEtag(header: string | null): string | undefined {
  if (!header) return undefined
  const first = header.split(',')[0].trim()
  if (!first || first === '*') return undefined
  return first.replace(/^W\//, '').replace(/^"(.*)"$/, '$1')
}

async function serveR2(env: Env, key: string, request: Request): Promise<Response> {
  const ifNoneMatch = parseConditionalEtag(request.headers.get('if-none-match'))
  const object = await env.R2.get(key, {
    onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch } : undefined,
  })
  if (!object) {
    // 有可能命中 304（ifNoneMatch 匹配），此时 get 返回 null
    if (ifNoneMatch) {
      const head = await env.R2.head(key)
      if (head) {
        return new Response(null, { status: 304, headers: buildR2Headers(head) })
      }
    }
    return new Response('Not Found', { status: 404 })
  }
  if (!('body' in object) || object.body === null) {
    return new Response(null, { status: 304, headers: buildR2Headers(object) })
  }
  return new Response(object.body, { headers: buildR2Headers(object) })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/_health') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
      })
    }

    const key = decodeURIComponent(path.replace(/^\//, ''))
    if (!key) return new Response('Not Found', { status: 404 })

    // 自循环 subrequest（来自下方 cf.image 的 fetch）：直接回原图字节。
    if (request.headers.has(PASSTHROUGH_HEADER)) {
      return serveR2(env, key, request)
    }

    // 非图片扩展名：直接从 R2 回源，不做优化
    if (!IMAGE_EXT.test(path)) {
      return serveR2(env, key, request)
    }

    const params = url.searchParams
    const width = parseIntInRange(params.get('w'), LIMITS.minDim, LIMITS.maxDim)
    const height = parseIntInRange(params.get('h'), LIMITS.minDim, LIMITS.maxDim)
    const quality =
      parseIntInRange(params.get('q'), LIMITS.minQuality, LIMITS.maxQuality) ??
      LIMITS.defaultQuality
    const formatParam = parseFormat(params.get('f'))

    let format: string | undefined
    if (formatParam === 'auto') {
      format = negotiateFormat(request.headers.get('Accept'))
    } else {
      format = formatParam
    }

    const imageOpts: Record<string, unknown> = {
      quality,
      fit: 'scale-down',
    }
    if (width) imageOpts.width = width
    if (height) imageOpts.height = height
    if (format) imageOpts.format = format

    // CF Image Resizing 只能对 fetch 拿到的 Response 做变换。用 worker 自身域名
    // fetch 触发 subrequest；带上 PASSTHROUGH_HEADER，本 worker 识别后直接回
    // 原图，再交给 cf.image 转换。即使没有任何 query 参数，也走 auto-format
    // 路径（让浏览器通过 Accept 拿到 webp/avif），避免 1MB+ 的 PNG 裸跑。
    const originUrl = `${url.origin}${url.pathname}`

    try {
      const response = await fetch(originUrl, {
        headers: {
          accept: request.headers.get('accept') || 'image/*',
          [PASSTHROUGH_HEADER]: '1',
        },
        cf: { image: imageOpts },
      })

      if (!response.ok) {
        // 404 一直透传；其他错误（cf.image 限流/输入过大等）降级回原图。
        if (response.status === 404) {
          return new Response(response.body, {
            status: 404,
            headers: response.headers,
          })
        }
        return serveR2(env, key, request)
      }

      const headers = new Headers(response.headers)
      headers.set('cache-control', 'public, max-age=86400, s-maxage=604800')
      headers.set('x-image-optimized', 'true')
      headers.set('access-control-allow-origin', '*')
      headers.set('vary', 'Accept')

      return new Response(response.body, { status: 200, headers })
    } catch (err) {
      console.error('image transform failed:', err)
      return serveR2(env, key, request)
    }
  },
}
