import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockApi, renderWithProviders } from '@/test/utils';
import SignUp from './SignUp';

describe('SignUp', () => {
  it('validates on the client before calling the api', async () => {
    const fetchMock = mockApi(() => undefined);
    renderWithProviders(<SignUp />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('at least 10 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows server field errors next to the right input', async () => {
    mockApi((url) =>
      url.endsWith('/signup')
        ? { status: 400, body: { error: { code: 'validation_failed', message: 'x', details: [{ path: 'displayName', message: 'that name is taken by a cat' }] } } }
        : undefined,
    );
    renderWithProviders(<SignUp />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Al' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'al@northeastern.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long enough password' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('that name is taken by a cat')).toBeInTheDocument();
  });
});
