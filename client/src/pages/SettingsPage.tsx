import { Tabs } from 'antd';
import { RequireRole } from '../auth/RequireAuth';
import { ApiTokensPage } from '../features/settings/ApiTokensPage';
import { SoftwareVersionsPage } from '../features/settings/SoftwareVersionsPage';

/** Admin-only settings area: software-version management + API-token management. */
export function SettingsPage() {
  return (
    <RequireRole role="admin">
      <Tabs
        defaultActiveKey="versions"
        items={[
          { key: 'versions', label: 'Softwareversionen', children: <SoftwareVersionsPage /> },
          { key: 'tokens', label: 'API-Zugriff', children: <ApiTokensPage /> },
        ]}
      />
    </RequireRole>
  );
}
