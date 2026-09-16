import { expect, test } from '@playwright/test'

test('all product headers and browser icons use the supplied StoryForge mark', async ({ page, request }) => {
  for (const route of ['', 'world', 'long', 'short/library', 'script/library', 'comic/library', 'motion/library', 'ttrpg/library', 'chat/library', 'town/library', 'avg/library', 'adventure/library', 'openworld/library', 'community/market']) {
    await page.goto(`./${route}`)
    const mark = page.locator('[data-storyforge-brand]').first()
    await expect(mark).toBeVisible()
    await expect(mark.locator('use')).toHaveAttribute('href', '/storyforge/brand/xuanxiang-mark.svg#mark')
    await expect.poll(() => mark.evaluate((svg: SVGGraphicsElement) => svg.getBBox().width)).toBeGreaterThan(180)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/storyforge/brand/xuanxiang-mark.svg')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('[data-storyforge-brand]').first()).toBeVisible()
  for (const [file, size] of [['brand/storyforge-icon.png', 1024], ['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    const response = await request.get(`./${file}`)
    expect(response.ok()).toBe(true)
    const png = await response.body()
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
    const alpha = await page.evaluate(async (file) => {
      const image = new Image()
      image.src = `/storyforge/${file}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 64
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0, 64, 64)
      const pixels = context.getImageData(0, 0, 64, 64).data
      return {
        corners: [0, 63, 63 * 64, 64 * 64 - 1].map(index => pixels[index * 4 + 3]),
        visible: Array.from(pixels).filter((value, index) => index % 4 === 3 && value > 0).length / (64 * 64),
      }
    }, file)
    expect(alpha.corners).toEqual([0, 0, 0, 0])
    expect(alpha.visible).toBeGreaterThan(0.1)
    expect(alpha.visible).toBeLessThan(0.5)
  }
})
