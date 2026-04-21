type DocStatus = 'draft' | 'published' | undefined

const fire = async (label: 'test' | 'prod', url: string) => {
  try {
    const res = await fetch(url, { method: 'POST' })
    console.log(`[triggerDeploy] ${label} → ${res.status}`)
  } catch (err) {
    console.error(`[triggerDeploy] ${label} failed`, err)
  }
}

export const triggerDeploy = async (currentStatus?: DocStatus, previousStatus?: DocStatus) => {
  const testUrl = process.env.CF_PAGES_DEPLOY_HOOK_TEST_URL
  const prodUrl = process.env.CF_PAGES_DEPLOY_HOOK_PROD_URL
  const wasOrIsPublished = currentStatus === 'published' || previousStatus === 'published'

  console.log('[triggerDeploy]', {
    hasTest: !!testUrl,
    hasProd: !!prodUrl,
    currentStatus,
    previousStatus,
    wasOrIsPublished,
  })

  const jobs: Promise<void>[] = []
  if (testUrl) jobs.push(fire('test', testUrl))
  if (wasOrIsPublished && prodUrl) jobs.push(fire('prod', prodUrl))
  await Promise.all(jobs)
}
