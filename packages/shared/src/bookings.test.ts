import { describe, expect, it } from 'vitest';
import { allowedActions, checkTransition, type TransitionContext } from './bookings.js';

const base = { startDate: '2027-02-01', today: '2027-01-01' };
const t = (c: Partial<TransitionContext> & Pick<TransitionContext, 'from' | 'to' | 'actor'>) =>
  checkTransition({ ...base, ...c });

describe('booking state machine', () => {
  it('lets the owner approve or reject a request', () => {
    expect(t({ from: 'requested', to: 'approved', actor: 'owner' }).ok).toBe(true);
    expect(t({ from: 'requested', to: 'rejected', actor: 'owner' }).ok).toBe(true);
  });

  it("doesn't let the guest approve their own request", () => {
    expect(t({ from: 'requested', to: 'approved', actor: 'guest' }).ok).toBe(false);
  });

  it('lets the guest withdraw a request, but not reject it', () => {
    expect(t({ from: 'requested', to: 'canceled', actor: 'guest' }).ok).toBe(true);
    expect(t({ from: 'requested', to: 'rejected', actor: 'guest' }).ok).toBe(false);
  });

  it('only the system expires requests', () => {
    expect(t({ from: 'requested', to: 'expired', actor: 'system' }).ok).toBe(true);
    expect(t({ from: 'requested', to: 'expired', actor: 'owner' }).ok).toBe(false);
  });

  it('treats rejected, canceled and expired as final', () => {
    for (const from of ['rejected', 'canceled', 'expired'] as const) {
      for (const to of ['requested', 'approved', 'canceled'] as const) {
        expect(t({ from, to, actor: 'owner' }).ok).toBe(false);
      }
    }
  });

  it('refuses to approve an expired request or one whose start date passed', () => {
    const now = new Date('2027-01-01T12:00:00Z');
    expect(t({ from: 'requested', to: 'approved', actor: 'owner', expiresAt: new Date('2027-01-01T11:59:59Z'), now }).ok).toBe(false);
    expect(t({ from: 'requested', to: 'approved', actor: 'owner', startDate: '2026-12-31' }).ok).toBe(false);
  });

  it('allows cancelling an approved stay only before it starts', () => {
    expect(t({ from: 'approved', to: 'canceled', actor: 'guest' }).ok).toBe(true);
    expect(t({ from: 'approved', to: 'canceled', actor: 'owner', startDate: '2027-01-01' }).ok).toBe(false);
    expect(t({ from: 'approved', to: 'canceled', actor: 'system', startDate: '2027-01-01' }).ok).toBe(true);
  });

  it('lists the actions each side can take', () => {
    expect(allowedActions('requested', 'owner', base.startDate, base.today).sort()).toEqual(['approved', 'rejected']);
    expect(allowedActions('requested', 'guest', base.startDate, base.today)).toEqual(['canceled']);
    expect(allowedActions('approved', 'guest', base.startDate, base.today)).toEqual(['canceled']);
    expect(allowedActions('rejected', 'owner', base.startDate, base.today)).toEqual([]);
  });
});
