// Review package U01 (I-038, findings 5-013 and 6-008). `index.html` previously held only the root element and the script tag, so
// the browser rendered the app in quirks mode (no table font inheritance, a different box model, no page language or title).
import { expect, test } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';

test.setTimeout(90_000);

test('the page is a standards-mode HTML document with a language, charset, viewport, and title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Project: / })).toBeVisible();

  const document = await page.evaluate(() => ({
    compatMode: window.document.compatMode,
    doctype: window.document.doctype?.name ?? null,
    lang: window.document.documentElement.lang,
    charset: window.document.characterSet,
    charsetMeta: window.document.querySelector('meta[charset]')?.getAttribute('charset')?.toLowerCase() ?? null,
    viewport: window.document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
    title: window.document.title,
  }));

  expect(document.compatMode).toBe('CSS1Compat');
  expect(document.doctype).toBe('html');
  expect(document.lang).toBe('en');
  expect(document.charset.toLowerCase()).toBe('utf-8');
  expect(document.charsetMeta).toBe('utf-8');
  expect(document.viewport).toContain('width=device-width');
  expect(document.title).toBe('Transit Costing Tool');
});

test('table text renders at the 14 px root size instead of the quirks-mode 16 px', async ({ page }) => {
  await createRouteWithPattern(page, 'Standards mode verification');
  // A table cell with no font size of its own (the Nodes table) inherits the root size through the table in standards mode only.
  const cell = page.locator('main table td, table td').first();
  await expect(cell).toBeVisible();
  expect(await cell.evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('14px');
});
