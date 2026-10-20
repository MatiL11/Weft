import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const PASSWORD = 'correct horse battery'

/** Collects Content-Security-Policy violations and uncaught errors from every page. */
function watchForProblems(context: BrowserContext): string[] {
  const problems: string[] = []
  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy/i.test(message.text())) {
        problems.push(`${page.url()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`))
  })
  return problems
}

async function signUp(page: Page, name: string, email: string, next = '/') {
  await page.goto(`/sign-up?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL((url) => url.pathname === new URL(next, url).pathname)
}

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

test('sign up, record, share, watch and comment', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const viewerContext = await browser.newContext()
  const ownerProblems = watchForProblems(ownerContext)
  const viewerProblems = watchForProblems(viewerContext)
  const owner = await ownerContext.newPage()

  await test.step('the owner creates an account and lands in an empty library', async () => {
    await signUp(owner, 'Ana Owner', `ana-${unique()}@example.com`)
    await expect(owner.getByText('Your library is empty')).toBeVisible()
  })

  let shareUrl = ''
  await test.step('records the screen and camera and gets a share link', async () => {
    await owner.getByRole('link', { name: 'New recording' }).first().click()
    await owner.getByRole('radio', { name: 'Screen and camera' }).click()
    await owner.getByRole('button', { name: 'Start recording' }).click()
    const stop = owner.getByRole('button', { name: 'Stop' })
    await expect(stop).toBeVisible()
    // The 3-second countdown, then a few seconds of recording.
    await owner.waitForTimeout(7_000)
    await stop.click()
    await expect(owner.getByText('Your link is ready')).toBeVisible({ timeout: 60_000 })
    shareUrl = await owner.locator('#share-link').inputValue()
    expect(shareUrl).toMatch(/\/v\/[\w-]+$/)
  })

  await test.step('the worker processes the video', async () => {
    await owner.goto(shareUrl)
    await expect(owner.getByText('Processed', { exact: true })).toBeVisible({ timeout: 180_000 })
  })

  const viewer = await viewerContext.newPage()
  await test.step('anyone with the link can watch it without an account', async () => {
    await viewer.goto(shareUrl)
    await viewer.getByRole('button', { name: 'Play' }).first().click()
    await viewer.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1.5)
    await expect(viewer.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  await test.step('the embed player plays on its own page', async () => {
    const embed = await viewerContext.newPage()
    await embed.goto(shareUrl.replace('/v/', '/embed/'))
    await embed.getByRole('button', { name: 'Play' }).first().click()
    await embed.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1)
    await embed.close()
  })

  const comment = `Great demo ${unique()}`
  await test.step('a viewer signs up and comments; the owner sees it live', async () => {
    const path = new URL(shareUrl).pathname
    await signUp(viewer, 'Beto Viewer', `beto-${unique()}@example.com`, path)
    await viewer.getByRole('textbox', { name: 'Comment' }).fill(comment)
    await viewer.getByRole('button', { name: 'Comment', exact: true }).click()
    await expect(viewer.getByText(comment)).toBeVisible()
    // The owner's page is still open: the comment arrives without reloading.
    await expect(owner.getByText(comment)).toBeVisible()
  })

  await test.step('the library counts the view', async () => {
    await owner.goto('/')
    await expect(async () => {
      await owner.reload()
      await expect(owner.getByText(/\b[1-9]\d* views?\b/)).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
  })

  expect([...ownerProblems, ...viewerProblems]).toEqual([])
  await ownerContext.close()
  await viewerContext.close()
})
