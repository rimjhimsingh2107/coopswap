import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { signUpVerified, stubGeocoder } from '../helpers';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'room.png');

test('create a listing through the multi-step form, add a photo, publish', async ({ page }) => {
  await signUpVerified(page, 'Jordan');
  await stubGeocoder(page);
  await page.goto('/listings/new');

  // step 1 validation
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('at least 5 characters')).toBeVisible();
  await page.getByLabel('Title').fill('Bright room two blocks from campus');
  await page.getByLabel('Description').fill('Quiet apartment, two roommates who are both on co-op. Laundry in the building.');
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 2 address autocomplete (geocoder stubbed)
  await page.getByRole('combobox', { name: 'Address' }).fill('360 hunt');
  await page.getByRole('option', { name: /360 Huntington Avenue/ }).click();
  await expect(page.getByText(/Only an approximate area/)).toBeVisible();
  await page.getByLabel('Apt / unit (private)').fill('4B');
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 3
  await page.getByLabel('Monthly rent ($)').fill('1350');
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 4 amenities, then the draft gets saved
  await page.getByLabel('Wi-Fi').check();
  await page.getByLabel('In-unit laundry').check();
  await page.getByRole('button', { name: 'Save & add photos' }).click();

  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByAltText('Photo 1')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();

  await expect(page.getByRole('heading', { name: 'Bright room two blocks from campus' })).toBeVisible();
  await expect(page.getByText('In-unit laundry')).toBeVisible();
  // owner sees their own exact address
  await expect(page.getByText(/360 Huntington Avenue, 4B/)).toBeVisible();
});
