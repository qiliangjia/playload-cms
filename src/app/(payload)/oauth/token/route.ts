import config from '@payload-config'
import { getPayload } from 'payload'
import {
  OAUTH_CLIENT_ID,
  OAUTH_TOKEN_TTL_SECONDS,
  consumeCode,
  isAllowedRedirectUri,
  mintPayloadJwt,
  verifyPkceS256,
  type OAuthCodeRow,
} from '../../../../lib/oauth'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const readForm = async (request: Request): Promise<Record<string, string>> => {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
      )
    } catch {
      return {}
    }
  }
  const form = await request.formData()
  const out: Record<string, string> = {}
  for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v
  return out
}

export async function POST(request: Request): Promise<Response> {
  const body = await readForm(request)
  if (body.grant_type !== 'authorization_code') {
    return json({ error: 'unsupported_grant_type' }, 400)
  }
  if (body.client_id !== OAUTH_CLIENT_ID) {
    return json({ error: 'invalid_client' }, 400)
  }
  if (!body.code || !body.redirect_uri || !body.code_verifier) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (!isAllowedRedirectUri(body.redirect_uri)) {
    return json({ error: 'invalid_redirect_uri' }, 400)
  }

  const payload = await getPayload({ config })

  const result = await consumeCode(payload, body.code)
  if (!result.ok) {
    return json({ error: 'invalid_grant', detail: (result as { reason: string }).reason }, 400)
  }
  const row = (result as { row: OAuthCodeRow }).row

  if (row.redirect_uri !== body.redirect_uri) {
    return json({ error: 'invalid_grant', detail: 'redirect_uri_mismatch' }, 400)
  }
  const pkceOk = await verifyPkceS256(body.code_verifier, row.code_challenge)
  if (!pkceOk) {
    return json({ error: 'invalid_grant', detail: 'pkce_verify_failed' }, 400)
  }

  const user = await payload.findByID({
    collection: 'users',
    id: row.user_id,
    depth: 0,
  })
  if (!user) {
    return json({ error: 'invalid_grant', detail: 'user_not_found' }, 400)
  }

  const secret = payload.secret || process.env.PAYLOAD_SECRET
  if (!secret) {
    return json({ error: 'server_error', detail: 'missing_secret' }, 500)
  }

  const minted = await mintPayloadJwt(
    { id: user.id as number, email: user.email as string, collection: 'users' },
    secret,
  )

  return json(
    {
      access_token: minted.token,
      token_type: 'bearer',
      expires_in: OAUTH_TOKEN_TTL_SECONDS,
    },
    200,
  )
}
