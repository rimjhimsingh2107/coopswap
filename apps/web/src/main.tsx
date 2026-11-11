import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query';
import { ToastProvider } from './components/ui/Toast';
import { RealtimeProvider } from './hooks/realtime';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
