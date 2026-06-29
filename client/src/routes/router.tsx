import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RequireAuth } from '../auth/RequireAuth';
import { AppLayout } from '../layout/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { DevicesPage } from '../pages/DevicesPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { ImportPage } from '../pages/ImportPage';
import { LoansPage } from '../pages/LoansPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SettingsPage } from '../pages/SettingsPage';
import { UpdatePage } from '../pages/UpdatePage';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/devices', element: <DevicesPage /> },
      { path: '/devices/:id', element: <DevicesPage /> },
      { path: '/ausleihen', element: <LoansPage /> },
      { path: '/update', element: <UpdatePage /> },
      { path: '/import', element: <ImportPage /> },
      { path: '/einstellungen', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
