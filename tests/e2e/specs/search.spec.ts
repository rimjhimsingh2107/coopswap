import { expect, test } from '@playwright/test';
import { apiCreateListing, signUpVerified } from '../helpers';

test('search and filter listings', async ({ page }) => {
  await signUpVerified(page, 'Morgan');
  const tag = `zx${Date.now().toString(36)}`;
  await apiCreateListing(page, { title: `Cheap ${tag} room`, monthlyRentCents: 80000 });
  await apiCreateListing(page, { title: `Pricey ${tag} studio`, monthlyRentCents: 260000, roomType: 'studio' });

  await page.goto(`/explore?q=${tag}`);
  await expect(page.getByRole('link', { name: new RegExp(`Cheap ${tag}`) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`Pricey ${tag}`) })).toBeVisible();

  await page.getByLabel('Max $/mo').fill('1000');
  await expect(page.getByRole('link', { name: new RegExp(`Pricey ${tag}`) })).toBeHidden();
  await expect(page).toHaveURL(/maxPrice=1000/);

  await page.getByLabel('Max $/mo').fill('');
  await page.getByRole('button', { name: 'Studio' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`Cheap ${tag}`) })).toBeHidden();
  await expect(page.getByRole('link', { name: new RegExp(`Pricey ${tag}`) })).toBeVisible();
});
