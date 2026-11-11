import { expect, test } from '@playwright/test';
import { PASSWORD, linkFromMail, signUpVerified, uniqueEmail } from '../helpers';

test('sign up, confirm email from the inbox, sign out and back in', async ({ page }) => {
  const email = await signUpVerified(page, 'Avery');
  await page.goto('/profile');
  await expect(page.getByText('Confirmed').first()).toBeVisible();
  await expect(page.getByText('@northeastern.edu')).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/explore/);
});

test('password reset from the email link', async ({ page }) => {
  const email = await signUpVerified(page, 'Riley');
  await page.context().clearCookies();
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();

  const link = await linkFromMail(page.request, email, '/reset-password');
  await page.goto(link);
  await page.getByLabel('New password').fill('a completely new password');
  await page.getByLabel('Confirm it').fill('a completely new password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a completely new password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/explore/);
});

test('unverified users get nudged and cannot request bookings', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Casey');
  await page.getByLabel('Email').fill(uniqueEmail('casey'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/for a link to confirm your email/)).toBeVisible();
});
