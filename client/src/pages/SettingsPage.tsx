import { RequireRole } from '../auth/RequireAuth';
import { ApiTokensPage } from '../features/settings/ApiTokensPage';

/** Admin-only settings area; currently the API-token management page. */
export function SettingsPage() {
  return (
    <RequireRole role="admin">
      <ApiTokensPage />
    </RequireRole>
  );
}
