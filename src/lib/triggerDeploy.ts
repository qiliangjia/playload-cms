const fire = (url: string | undefined) => {
  if (!url) return
  fetch(url, { method: 'POST' }).catch(() => {})
}

type DocStatus = 'draft' | 'published' | undefined

export const triggerDeploy = (currentStatus?: DocStatus, previousStatus?: DocStatus) => {
  fire(process.env.CF_PAGES_DEPLOY_HOOK_TEST_URL)

  const wasOrIsPublished = currentStatus === 'published' || previousStatus === 'published'
  if (wasOrIsPublished) {
    fire(process.env.CF_PAGES_DEPLOY_HOOK_PROD_URL)
  }
}
