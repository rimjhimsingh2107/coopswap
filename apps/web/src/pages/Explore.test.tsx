import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockApi, renderWithProviders } from '@/test/utils';
import Explore from './Explore';

describe('Explore', () => {
  it('shows skeletons, then an empty state with a way out', async () => {
    mockApi((url) => (url.includes('/api/listings') ? { body: { data: { items: [], nextCursor: null, total: 0 } } } : { status: 204 }));
    renderWithProviders(<Explore />, { route: '/explore?city=Boston&state=MA&maxPrice=500' });
    expect(screen.getByRole('heading', { name: 'Sublets in Boston, MA' })).toBeInTheDocument();
    expect(await screen.findByText('No places match that')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('passes url filters through to the search api', async () => {
    const fetchMock = mockApi((url) =>
      url.includes('/api/listings')
        ? { body: { data: { items: [], nextCursor: null, total: 0 } } }
        : { status: 204 },
    );
    renderWithProviders(<Explore />, { route: '/explore?city=Boston&state=MA&roomTypes=studio&start=2030-01-01&end=2030-05-01' });
    await screen.findByText('No places match that');
    const url = String(fetchMock.mock.calls.find(([u]) => String(u).includes('/api/listings'))![0]);
    expect(url).toContain('city=Boston');
    expect(url).toContain('roomTypes=studio');
    expect(url).toContain('start=2030-01-01');
  });

  it('shows an error with a retry when the api fails', async () => {
    mockApi(() => ({ status: 500, body: { error: { code: 'internal', message: 'something went wrong' } } }));
    renderWithProviders(<Explore />, { route: '/explore' });
    expect(await screen.findByRole('alert')).toHaveTextContent('something went wrong');
  });
});
