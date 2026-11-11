import { expect, test } from '@playwright/test';
import { apiCreateListing, newUser } from '../helpers';

async function requestDates(page: import('@playwright/test').Page, listingId: string, start: string, end: string) {
  await page.goto(`/listings/${listingId}`);
  await page.getByLabel('Move in').fill(start);
  await page.getByLabel('Move out').fill(end);
  await page.getByRole('button', { name: 'Request to book' }).click();
}

test('request, live notification, approval, and the overlapping request gets bounced', async ({ browser }) => {
  const owner = await newUser(browser, 'Owner');
  const listingId = await apiCreateListing(owner.page, { title: 'Booking flow room' });
  const g1 = await newUser(browser, 'Guest One');
  const g2 = await newUser(browser, 'Guest Two');

  // owner is sitting on the bookings page; the request should show up without a reload
  await owner.page.goto('/bookings');
  await owner.page.getByRole('tab', { name: 'Requests for my places' }).click();

  await requestDates(g1.page, listingId, '2030-03-01', '2030-05-01');
  await expect(g1.page.getByText('Request sent')).toBeVisible();
  await requestDates(g2.page, listingId, '2030-04-01', '2030-06-01');
  await expect(g2.page.getByText('Request sent')).toBeVisible();

  await expect(owner.page.getByText(/Guest One requested/)).toBeVisible(); // toast via socket
  await expect(owner.page.getByRole('button', { name: 'Approve' })).toHaveCount(2);

  // approve guest one
  await owner.page.locator('li', { hasText: 'Guest One' }).getByRole('button', { name: 'Approve' }).click();
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(owner.page.locator('li', { hasText: 'Guest One' }).getByText('Approved')).toBeVisible();
  // guest two's overlapping request was closed automatically
  await expect(owner.page.locator('li', { hasText: 'Guest Two' }).getByText('Declined')).toBeVisible();

  // guest one gets told, and now sees the address
  await g1.page.goto('/notifications');
  await expect(g1.page.getByText(/was approved/)).toBeVisible();
  await g1.page.goto(`/listings/${listingId}`);
  await expect(g1.page.getByText(/360 Huntington Ave/)).toBeVisible();

  // a third person can't even ask for overlapping dates now
  const g3 = await newUser(browser, 'Guest Three');
  await requestDates(g3.page, listingId, '2030-04-15', '2030-06-15');
  await expect(g3.page.getByRole('alert')).toContainText(/already booked/i);

  // back-to-back is fine (checkout day is free)
  await requestDates(g3.page, listingId, '2030-05-01', '2030-06-15');
  await expect(g3.page.getByText('Request sent')).toBeVisible();

  for (const u of [owner, g1, g2, g3]) await u.ctx.close();
});

test('two owners tabs approving competing requests: only one sticks', async ({ browser }) => {
  const owner = await newUser(browser, 'Busy Owner');
  const listingId = await apiCreateListing(owner.page);
  const a = await newUser(browser, 'Alpha');
  const b = await newUser(browser, 'Bravo');
  await requestDates(a.page, listingId, '2030-02-01', '2030-04-01');
  await requestDates(b.page, listingId, '2030-03-01', '2030-05-01');

  const tab2 = await owner.ctx.newPage();
  for (const p of [owner.page, tab2]) {
    await p.goto('/bookings');
    await p.getByRole('tab', { name: 'Requests for my places' }).click();
    await expect(p.getByRole('button', { name: 'Approve' })).toHaveCount(2);
  }
  await owner.page.locator('li', { hasText: 'Alpha' }).getByRole('button', { name: 'Approve' }).click();
  await tab2.locator('li', { hasText: 'Bravo' }).getByRole('button', { name: 'Approve' }).click();
  await Promise.all([
    owner.page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click(),
    tab2.getByRole('dialog').getByRole('button', { name: 'Approve' }).click(),
  ]);

  // whichever lost sees an error in its dialog; reload shows exactly one approved
  await owner.page.reload();
  await owner.page.getByRole('tab', { name: 'Requests for my places' }).click();
  await owner.page.getByRole('button', { name: 'Everything' }).click();
  await expect(owner.page.getByText('Approved', { exact: true })).toHaveCount(1);
  for (const u of [owner, a, b]) await u.ctx.close();
});
