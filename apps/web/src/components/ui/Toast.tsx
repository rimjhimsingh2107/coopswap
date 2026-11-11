import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

interface Toast {
  id: number;
  text: string;
  href?: string;
  tone?: 'info' | 'error';
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${t.tone === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-stone-900 text-white ring-stone-800'}`}
          >
            {t.href ? (
              <Link to={t.href} className="hover:underline">
                {t.text}
              </Link>
            ) : (
              t.text
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
