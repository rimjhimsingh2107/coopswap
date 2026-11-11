import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ListingDetail } from '@coopswap/shared';
import { mockApi, renderWithProviders, testUser } from '@/test/utils';
import { BookingPanel } from './BookingPanel';

const listing = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Room',
  availableFrom: '2030-01-01',
  availableTo: '2030-12-31',
  minStayDays: 30,
  maxOccupants: 2,
  monthlyRentCents: 120000,
  utilitiesIncluded: false,
  utilitiesEstCents: null,
  bookedRanges: [{ start: '2030-03-01', end: '2030-05-01' }],
  isOwner: false,
  owner: { id: 'o', displayName: 'Sam' },
} as unknown as ListingDetail;

const setDates = (start: string, end: string) => {
  fireEvent.change(screen.getByLabelText('Move in'), { target: { value: start } });
  fireEvent.change(screen.getByLabelText('Move out'), { target: { value: end } });
};

describe('BookingPanel', () => {
  it('asks signed out visitors to sign in', () => {
    renderWithProviders(<BookingPanel listing={listing} />);
    expect(screen.getByRole('link', { name: /sign in to request/i })).toHaveAttribute('href', `/signin?next=/listings/${listing.id}`);
  });

  it('flags stays shorter than the minimum', () => {
    renderWithProviders(<BookingPanel listing={listing} />, { user: testUser });
    setDates('2030-06-01', '2030-06-10');
    expect(screen.getByRole('alert')).toHaveTextContent('Minimum stay is 30 days');
    expect(screen.getByRole('button', { name: /request to book/i })).toBeDisabled();
  });

  it('flags dates that overlap a booked stay, but not back to back ones', () => {
    renderWithProviders(<BookingPanel listing={listing} />, { user: testUser });
    setDates('2030-04-15', '2030-06-15');
    expect(screen.getByRole('alert')).toHaveTextContent(/already booked/i);
    setDates('2030-05-01', '2030-06-15');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends an idempotency key and reuses it when retrying the same request', async () => {
    let calls = 0;
    const fetchMock = mockApi((url) => {
      if (url.endsWith('/api/bookings')) {
        calls++;
        // first attempt "fails" like a dropped connection would
        return calls === 1 ? { status: 503, body: { error: { code: 'internal', message: 'try again' } } } : { status: 201, body: { data: { id: 'b1', expiresAt: new Date().toISOString() } } };
      }
    });
    renderWithProviders(<BookingPanel listing={listing} />, { user: testUser });
    setDates('2030-06-01', '2030-08-01');
    fireEvent.click(screen.getByRole('button', { name: /request to book/i }));
    await screen.findByText('try again');
    fireEvent.click(screen.getByRole('button', { name: /request to book/i }));
    await screen.findByText('Request sent');

    const keys = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/bookings')).map(([, init]) => (init?.headers as Record<string, string>)['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });

  it('shows a clear message when someone else took the dates', async () => {
    mockApi(() => ({ status: 409, body: { error: { code: 'booking_conflict', message: 'those dates are already booked' } } }));
    renderWithProviders(<BookingPanel listing={listing} />, { user: testUser });
    setDates('2030-06-01', '2030-08-01');
    fireEvent.click(screen.getByRole('button', { name: /request to book/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/someone else just got those dates/i));
  });
});
