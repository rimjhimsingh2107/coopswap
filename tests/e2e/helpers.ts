import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const PASSWORD = 'correct horse battery staple';

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@northeastern.edu`;

// pull the newest link for `to` out of mailpit
export async function linkFromMail(request: APIRequestContext, to: string, path: string) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await res.json()) as { messages: Array<{ ID: string }> };
        if (!messages?.length) return null;
        const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as { Text: string };
        link = msg.Text.match(new RegExp(`https?://\\S+${path}\\?token=[\\w%-]+`))?.[0];
        return link ?? null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return new URL(link!).pathname + new URL(link!).search;
}

export async function signUpVerified(page: Page, name: string) {
  const email = uniqueEmail(name.toLowerCase());
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/explore/);
  const link = await linkFromMail(page.request, email, '/verify-email');
  await page.goto(link);
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  return email;
}

export async function newUser(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUpVerified(page, name);
  return { ctx, page, email };
}

// Listings through the api from the page's own session (faster than the form).
// The form itself is covered in listing.spec.ts.
export async function apiCreateListing(page: Page, overrides: Record<string, unknown> = {}) {
  const csrf = (await page.context().cookies()).find((c) => c.name === 'cs_csrf')!.value;
  const body = {
    title: 'E2E room near Ruggles',
    description: 'A perfectly fine room used by the end to end tests. Quiet, sunny.',
    addressLine1: '360 Huntington Ave',
    city: 'Boston',
    state: 'MA',
    postalCode: '02115',
    lat: 42.3398,
    lng: -71.0892,
    availableFrom: '2030-01-01',
    availableTo: '2030-12-31',
    minStayDays: 30,
    monthlyRentCents: 115000,
    furnishing: 'furnished',
    roomType: 'private_room',
    maxOccupants: 1,
    amenities: ['wifi'],
    ...overrides,
  };
  const headers = { 'x-csrf-token': csrf };
  const created = await page.request.post('/api/listings', { data: body, headers });
  expect(created.status()).toBe(201);
  const { data } = (await created.json()) as { data: { id: string } };
  expect((await page.request.post(`/api/listings/${data.id}/publish`, { headers })).status()).toBe(200);
  return data.id;
}

export async function stubGeocoder(page: Page) {
  await page.route('**/api/geocode**', (route) =>
    route.fulfill({
      json: {
        data: [
          { label: '360 Huntington Avenue, Boston, MA', street: '360 Huntington Avenue', city: 'Boston', state: 'MA', postalCode: '02115', lat: 42.3398, lng: -71.0892, kind: 'address' },
        ],
      },
    }),
  );
}
