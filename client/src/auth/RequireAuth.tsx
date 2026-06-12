import { Spin } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

function CenteredSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <Spin size="large" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // server OIDC start — full-page nav, NOT a client route
      window.location.href = '/api/auth/login';
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return <CenteredSpinner />;
  }
  return <>{children}</>;
}

export function RequireRole({
  role,
  children,
}: {
  role: 'admin';
  children: ReactNode;
}) {
  const { isLoading, role: currentRole } = useAuth();

  if (isLoading) {
    return <CenteredSpinner />;
  }
  if (currentRole !== role) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}
