import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { createQueryClient } from './queryClient';

// One default singleton QueryClient created at module scope; tests may inject a
// fresh client via the optional `client` prop.
const defaultClient = createQueryClient();

export function AppProviders({
  children,
  client,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  return (
    <QueryClientProvider client={client ?? defaultClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
