import { expect, test } from '@playwright/test';
import { apiCreateListing, newUser } from '../helpers';

test('live chat with typing indicator, read receipts and unread badge', async ({ browser }) => {
  const owner = await newUser(browser, 'Host');
  const listingId = await apiCreateListing(owner.page, { title: 'Chat test room' });
  const guest = await newUser(browser, 'Visitor');

  await guest.page.goto(`/listings/${listingId}`);
  await guest.page.getByRole('button', { name: 'Message Host' }).click();
  await guest.page.getByLabel('Message').fill('Hi! Is the room still free in March?');
  await guest.page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(guest.page).toHaveURL(/\/messages\//);

  // owner's header badge updates over the socket
  await owner.page.goto('/explore');
  await expect(owner.page.getByRole('link', { name: 'Messages' })).toContainText('1');
  await owner.page.getByRole('link', { name: 'Messages' }).click();
  await owner.page.getByRole('link', { name: /Visitor/ }).click();
  await expect(owner.page.getByText('Hi! Is the room still free in March?')).toBeVisible();

  // guest sees it was read
  await expect(guest.page.getByText('seen')).toBeVisible();

  // typing shows up on the other side, then the reply arrives live
  await owner.page.getByLabel('Message').pressSequentially('Yes it is');
  await expect(guest.page.getByText('Host is typing…')).toBeVisible();
  await owner.page.getByLabel('Message').press('Enter');
  await expect(guest.page.getByText('Yes it is')).toBeVisible();

  // reconnect: guest goes offline, owner sends, guest comes back and has it
  await guest.ctx.setOffline(true);
  await owner.page.getByLabel('Message').fill('Want to do a video call?');
  await owner.page.getByLabel('Message').press('Enter');
  await guest.ctx.setOffline(false);
  await expect(guest.page.getByText('Want to do a video call?')).toBeVisible({ timeout: 15_000 });

  await owner.ctx.close();
  await guest.ctx.close();
});
