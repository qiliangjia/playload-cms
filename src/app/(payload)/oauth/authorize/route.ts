import config from '@payload-config'
import { getPayload } from 'payload'
import {
  OAUTH_CLIENT_ID,
  OAUTH_CODE_TTL_SECONDS,
  generateCode,
  isAllowedRedirectUri,
  nowSeconds,
  storeCode,
} from '../../../../lib/oauth'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const responseType = url.searchParams.get('response_type')
  const redirectUri = url.searchParams.get('redirect_uri')
  const codeChallenge = url.searchParams.get('code_challenge')
  const codeChallengeMethod = url.searchParams.get('code_challenge_method')
  const state = url.searchParams.get('state') ?? ''

  if (clientId !== OAUTH_CLIENT_ID) {
    return json({ error: 'invalid_client' }, 400)
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    return json({ error: 'invalid_redirect_uri' }, 400)
  }
  if (responseType !== 'code' || !codeChallenge || codeChallengeMethod !== 'S256') {
    return json({ error: 'invalid_request' }, 400)
  }

  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || typeof user.id !== 'number' || user.collection !== 'users') {
    const loginUrl = new URL('/oauth/login', url.origin)
    loginUrl.searchParams.set('redirect', url.pathname + url.search)
    return Response.redirect(loginUrl.toString(), 302)
  }

  const code = generateCode()
  await storeCode(payload, {
    code,
    user_id: user.id,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    redirect_uri: redirectUri,
    expires_at: nowSeconds() + OAUTH_CODE_TTL_SECONDS,
  })

  const callback = new URL(redirectUri)
  callback.searchParams.set('code', code)
  if (state) callback.searchParams.set('state', state)
  return Response.redirect(callback.toString(), 302)
}
