import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockApi, renderWithProviders } from '@/test/utils';
import { PlaceSearch } from './PlaceSearch';

describe('PlaceSearch', () => {
  it('debounces, then lets you pick a result with the keyboard', async () => {
    const fetchMock = mockApi((url) =>
      url.includes('/api/geocode')
        ? { body: { data: [
            { label: 'Boston, MA', city: 'Boston', state: 'MA', lat: 42.36, lng: -71.06, street: null, postalCode: null },
            { label: 'Boston Heights, OH', city: 'Boston Heights', state: 'OH', lat: 41.26, lng: -81.5, street: null, postalCode: null },
          ] } }
        : undefined,
    );
    const onPick = vi.fn();
    renderWithProviders(<PlaceSearch kind="city" label="City" onPick={onPick} />);
    const input = screen.getByRole('combobox', { name: 'City' });
    fireEvent.focus(input);
    for (const v of ['b', 'bo', 'bos', 'bost', 'boston']) fireEvent.change(input, { target: { value: v } });

    await screen.findByText('Boston Heights, OH');
    // one request for the settled text, not one per keystroke
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('geocode'))).toHaveLength(1);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ city: 'Boston Heights', state: 'OH' }));
  });
});
