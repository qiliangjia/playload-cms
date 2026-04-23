import config from '@payload-config'
import { getPayload } from 'payload'
import { generatePayloadCookie } from 'payload'

const FALLBACK_REDIRECT = '/admin'

const sanitizeRedirect = (raw: string | null): string => {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return FALLBACK_REDIRECT
  return raw
}

const htmlResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })

const loginPage = (redirect: string, error?: string) => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>CMS MCP · Sign in</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f6f7f9; margin: 0;
             min-height: 100vh; display: flex; align-items: center; justify-content: center; }
      form { background: #fff; padding: 32px; border-radius: 12px; width: 320px;
             box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
      h1 { margin: 0 0 16px; font-size: 18px; }
      label { display: block; font-size: 12px; color: #555; margin: 12px 0 4px; }
      input { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px;
              box-sizing: border-box; font-size: 14px; }
      button { margin-top: 20px; width: 100%; padding: 10px; background: #111827;
               color: #fff; border: 0; border-radius: 6px; font-size: 14px; cursor: pointer; }
      .error { color: #b91c1c; font-size: 12px; margin-top: 12px; }
      .hint { color: #6b7280; font-size: 12px; margin-top: 16px; text-align: center; }
    </style>
  </head>
  <body>
    <form method="POST" action="/oauth/login">
      <h1>Sign in to continue</h1>
      <input type="hidden" name="redirect" value="${redirect.replace(/"/g, '&quot;')}" />
      <label>Email</label>
      <input type="email" name="email" required autofocus />
      <label>Password</label>
      <input type="password" name="password" required />
      <button type="submit">Sign in</button>
      ${error ? `<p class="error">${error}</p>` : ''}
      <p class="hint">This is the CMS admin account.</p>
    </form>
  </body>
</html>`

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const redirect = sanitizeRedirect(url.searchParams.get('redirect'))

  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (user && user.collection === 'users') {
    return Response.redirect(new URL(redirect, url.origin).toString(), 302)
  }
  return htmlResponse(loginPage(redirect))
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const form = await request.formData()
  const email = typeof form.get('email') === 'string' ? (form.get('email') as string) : ''
  const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : ''
  const redirect = sanitizeRedirect(
    typeof form.get('redirect') === 'string' ? (form.get('redirect') as string) : null,
  )

  if (!email || !password) {
    return htmlResponse(loginPage(redirect, 'Email and password are required.'), 400)
  }

  const payload = await getPayload({ config })
  try {
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    if (!result?.token) {
      return htmlResponse(loginPage(redirect, 'Login failed.'), 401)
    }
    const cookie = generatePayloadCookie({
      collectionAuthConfig: payload.collections.users.config.auth,
      cookiePrefix: payload.config.cookiePrefix,
      token: result.token,
    })
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL(redirect, url.origin).toString(),
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return htmlResponse(loginPage(redirect, 'Invalid email or password.'), 401)
  }
}
