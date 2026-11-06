// Day and Direction are segmented toggles in the scope bar (Decision 0059, package ST4).
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';
import { scopeField, scopeText } from './support/ui';

test.setTimeout(90_000);

async function openTrips(page: Page, raw = { ...goldenRaw(), generationSets: [] }) {
  await seedSnapshot(page, raw);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
}

const radios = (page: Page, label: 'Day' | 'Direction') => scopeField(page, label).getByRole('radio');

test('Day and Direction switch with one click and show abbreviations with full names', async ({ page }) => {
  await openTrips(page);
  await expect(scopeField(page, 'Day')).toHaveAttribute('role', 'radiogroup');
  await expect(radios(page, 'Day')).toHaveText(['WKD', 'SAT', 'SUN', 'HOL']);
  await expect(radios(page, 'Day').first()).toHaveAttribute('title', 'Weekday');
  await expect(radios(page, 'Direction')).toHaveText(['Southbound', 'Northbound']);
  // No visible "Day" or "Direction" label (U5).
  await expect(page.getByRole('region', { name: 'Scope', exact: true }).locator('.context-field__label', { hasText: /^(Day|Direction)$/ })).toHaveCount(0);

  await scopeField(page, 'Day').getByRole('radio', { name: 'Saturday', exact: true }).click();
  await expect(scopeField(page, 'Day').getByRole('radio', { name: 'Saturday', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(scopeField(page, 'Day').locator('[aria-checked="true"]')).toHaveCount(1);

  await radios(page, 'Direction').nth(1).click();
  await expect(radios(page, 'Direction').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(radios(page, 'Direction').nth(0)).toHaveAttribute('aria-checked', 'false');
});

test('arrow keys, Home and End move and select, wrapping at the ends', async ({ page }) => {
  await openTrips(page);
  await scopeField(page, 'Day').getByRole('radio', { name: 'Weekday', exact: true }).click();
  const checked = scopeField(page, 'Day').locator('[aria-checked="true"]');
  await expect(checked).toHaveAttribute('tabindex', '0');
  await expect(radios(page, 'Day').nth(1)).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scopeText(page, 'Day')).toBe('Saturday');
  await expect(radios(page, 'Day').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => scopeText(page, 'Day')).toBe('Holiday');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => scopeText(page, 'Day')).toBe('Weekday');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => scopeText(page, 'Day')).toBe('Holiday');
  await page.keyboard.press('Home');
  await expect.poll(() => scopeText(page, 'Day')).toBe('Weekday');
  await expect(radios(page, 'Day').first()).toBeFocused();
});

test('the Blocking Day is the same toggle', async ({ page }) => {
  await openTrips(page);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(scopeField(page, 'Day')).toHaveAttribute('role', 'radiogroup', { timeout: 30_000 });
  await scopeField(page, 'Day').getByRole('radio', { name: 'Sunday', exact: true }).click();
  await expect.poll(() => scopeText(page, 'Day')).toBe('Sunday');
});

test('an entered abbreviation labels the Day segment', async ({ page }) => {
  const raw = { ...goldenRaw(), generationSets: [] };
  raw.serviceDays = raw.serviceDays.map((day: any) => day.kind === 'weekday' ? { ...day, abbreviation: 'MF' } : day);
  await openTrips(page, raw);
  await expect(radios(page, 'Day')).toHaveText(['MF', 'SAT', 'SUN', 'HOL']);
});

test('Direction falls back to a select when a route has more than two directions', async ({ page }) => {
  const raw = { ...goldenRaw(), generationSets: [] };
  const first = raw.directions[0];
  raw.directions = [...raw.directions, { ...first, id: 'third-direction', name: 'Loop', group: 'outbound', sequence: 5, columns: [] }];
  await openTrips(page, raw);
  const direction = scopeField(page, 'Direction');
  await expect(direction).toBeVisible();
  expect(await direction.evaluate((element) => element.tagName)).toBe('SELECT');
  await expect(direction.locator('option')).toHaveText(['Southbound', 'Northbound', 'Loop']);
  await expect(scopeField(page, 'Day')).toHaveAttribute('role', 'radiogroup');
});

test('the narrow layout uses selects without visible labels', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await openTrips(page);
  const day = scopeField(page, 'Day');
  await expect(day).toBeVisible();
  expect(await day.evaluate((element) => element.tagName)).toBe('SELECT');
  await expect(day.locator('option')).toHaveText(['Weekday', 'Saturday', 'Sunday', 'Holiday']);
  expect(await scopeField(page, 'Direction').evaluate((element) => element.tagName)).toBe('SELECT');
  await expect(page.getByRole('region', { name: 'Scope', exact: true }).locator('.context-field__label', { hasText: /^(Day|Direction)$/ })).toHaveCount(0);
});
