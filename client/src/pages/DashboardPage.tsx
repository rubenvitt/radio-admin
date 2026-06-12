import { Typography } from 'antd';
import { Dashboard } from '../features/dashboard/Dashboard';

export function DashboardPage() {
  return (
    <>
      <Typography.Title level={3}>Dashboard</Typography.Title>
      <Dashboard />
    </>
  );
}
