import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Rasterize the supplied vector without adding a background or wordmark.
const source = await readFile(new URL('../public/brand/xuanxiang-mark.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  for (const [file, size] of [['brand/storyforge-icon.png', 1024], ['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const png = await page.evaluate(async ({ source, size }) => {
      const image = new Image()
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(image, 0, 0, size, size)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { source, size })
    await writeFile(new URL(`../public/${file}`, import.meta.url), Buffer.from(png, 'base64'))
    console.log(`Generated transparent ${file} (${size}×${size})`)
  }
} finally {
  await browser.close()
}
