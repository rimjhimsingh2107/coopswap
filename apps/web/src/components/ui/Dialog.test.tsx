import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('focuses inside, traps tab, and closes on escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Approve?" footer={<><button>No</button><button>Yes</button></>}>
        body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Approve?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('No')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByText('Yes')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByText('No')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
