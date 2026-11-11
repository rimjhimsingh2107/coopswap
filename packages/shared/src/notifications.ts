export const NOTIFICATION_TYPES = [
  'booking.requested',
  'booking.approved',
  'booking.rejected',
  'booking.canceled',
  'booking.expired',
  'message.new',
  'listing.updated',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: string;
  type: NotificationType;
  // small, display-only. ids to link to plus a couple of names/titles
  payload: {
    bookingId?: string;
    listingId?: string;
    conversationId?: string;
    listingTitle?: string;
    actorName?: string;
    reason?: string | null;
    count?: number;
    startDate?: string;
    endDate?: string;
    changes?: string[];
  };
  readAt: string | null;
  createdAt: string;
}

export function describeNotification(n: AppNotification): string {
  const p = n.payload;
  const title = p.listingTitle ? `"${p.listingTitle}"` : 'your listing';
  switch (n.type) {
    case 'booking.requested':
      return `${p.actorName ?? 'Someone'} requested ${title} for ${p.startDate} → ${p.endDate}`;
    case 'booking.approved':
      return `Your request for ${title} was approved`;
    case 'booking.rejected':
      return `Your request for ${title} was declined${p.reason ? `: ${p.reason}` : ''}`;
    case 'booking.canceled':
      return `A booking for ${title} was canceled${p.reason ? `: ${p.reason}` : ''}`;
    case 'booking.expired':
      return `Your request for ${title} expired without a reply`;
    case 'message.new':
      return p.count && p.count > 1
        ? `${p.count} new messages from ${p.actorName ?? 'someone'}`
        : `New message from ${p.actorName ?? 'someone'}`;
    case 'listing.updated':
      return `${title} was updated (${(p.changes ?? []).join(', ') || 'details'})`;
  }
}
