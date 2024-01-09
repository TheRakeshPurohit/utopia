import type { ElementHandle, Page } from 'puppeteer'
import { setupBrowser, wait } from '../utils'

const TIMEOUT = 120000

const BRANCH_NAME = process.env.BRANCH_NAME ? `&branch_name=${process.env.BRANCH_NAME}` : ''

async function signIn(page: Page) {
  const signInButton = await page.waitForSelector('div[data-testid="sign-in-button"]')
  await signInButton!.click()
  await page.waitForSelector('#playground-scene') // wait for the scene to render
}

async function clickCanvasContainer(page: Page, { x, y }: { x: number; y: number }) {
  const canvasControlsContainer = await page.waitForSelector('#new-canvas-controls-container')
  await canvasControlsContainer!.click({ offset: { x, y } })
}

async function expectNSelectors(page: Page, selector: string, n: number) {
  const elementsMatchingSelector = await page.$$(selector)
  expect(elementsMatchingSelector).toHaveLength(n)
}

describe('Collaboration test', () => {
  it(
    'can place a comment',
    async () => {
      const setupBrowser1Promise = setupBrowser(
        `http://localhost:8000/p/56a2ac40-caramel-yew?fakeUser=alice&Multiplayer=true${BRANCH_NAME}`,
        TIMEOUT,
      )
      const setupBrowser2Promise = setupBrowser(
        `http://localhost:8000/p/56a2ac40-caramel-yew?fakeUser=bob&Multiplayer=true${BRANCH_NAME}`,
        TIMEOUT,
      )
      const { page: page1, browser: browser1 } = await setupBrowser1Promise
      const { page: page2, browser: browser2 } = await setupBrowser2Promise

      await Promise.all([signIn(page1), signIn(page2)])
      await Promise.all([
        clickCanvasContainer(page1, { x: 500, y: 500 }),
        clickCanvasContainer(page2, { x: 500, y: 500 }),
      ])

      const insertTab = (await page1.$x(
        "//div[contains(text(), 'Insert')]",
      )) as ElementHandle<Element>[]
      await insertTab!.at(0)!.click()

      const sampleTextOptions = (await page1.$x(
        "//span[contains(text(), 'Sample text')]",
      )) as ElementHandle<Element>[]
      await sampleTextOptions!.at(0)!.click()
      await clickCanvasContainer(page1, { x: 500, y: 500 })

      await clickCanvasContainer(page1, { x: 500, y: 500 })

      const sampleText = await page2.waitForFunction(
        'document.querySelector("body").innerText.includes("Sample text")',
      )

      expect(sampleText).not.toBeNull()

      await page1.keyboard.down('MetaLeft')
      await page1.keyboard.press('z', {})
      await page1.keyboard.up('MetaLeft')

      await page1.close()
      await browser1.close()
      await page2.close()
      await browser2.close()
    },
    TIMEOUT,
  )
})
