import { Link, useParams } from 'react-router';
import clsx from 'clsx';
import { useConversations } from '@/hooks/data';
import { useSession } from '@/hooks/session';
import { timeAgo } from '@/lib/format';
import { Thread } from '@/components/messages/Thread';
import { Avatar, EmptyState, ErrorNote } from '@/components/ui/misc';
import { ButtonLink } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';

export default function Messages() {
  const { id } = useParams();
  const { user } = useSession();
  const convs = useConversations();

  if (convs.isPending) return <PageSpinner />;
  if (convs.isError) return <div className="p-6"><ErrorNote error={convs.error} retry={() => convs.refetch()} /></div>;
  const items = convs.data.items;

  if (!items.length) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <EmptyState title="No conversations yet" body="Message an owner from any listing to ask about the place." action={<ButtonLink to="/explore">Browse listings</ButtonLink>} />
      </div>
    );
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-4rem)] max-w-6xl grid-cols-1 md:grid-cols-[320px_1fr] md:border-x md:border-stone-200">
      <nav aria-label="Conversations" className={clsx('overflow-y-auto border-r border-stone-200 bg-white', id && 'hidden md:block')}>
        <h1 className="px-5 pt-5 pb-3 text-lg font-semibold">Messages</h1>
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`} aria-current={c.id === id ? 'page' : undefined} className={clsx('flex gap-3 px-5 py-3 hover:bg-stone-50', c.id === id && 'bg-stone-100')}>
                <Avatar name={c.other.displayName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={clsx('truncate text-sm', c.unread ? 'font-semibold' : 'font-medium')}>{c.other.displayName}</p>
                    {c.lastMessageAt && <span className="shrink-0 text-xs text-stone-400">{timeAgo(c.lastMessageAt)}</span>}
                  </div>
                  <p className="truncate text-xs text-stone-500">{c.listing.title}</p>
                  <p className={clsx('truncate text-sm', c.unread ? 'text-stone-900' : 'text-stone-500')}>
                    {c.lastMessage ? `${c.lastMessage.senderId === user?.id ? 'You: ' : ''}${c.lastMessage.body}` : 'No messages yet'}
                  </p>
                </div>
                {c.unread > 0 && <span className="mt-1 h-5 min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-xs leading-5 text-white">{c.unread}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section className={clsx('flex min-h-0 flex-col bg-white', !id && 'hidden md:flex')}>
        {id ? (
          <>
            <Link to="/messages" className="block border-b border-stone-200 px-5 py-2 text-sm text-stone-600 md:hidden">← All messages</Link>
            <Thread key={id} conversationId={id} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">Pick a conversation</div>
        )}
      </section>
    </div>
  );
}
