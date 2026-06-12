import { Button, Drawer, Grid, Layout, Menu, Space, Typography, theme } from 'antd';
import { useState, type ReactNode } from 'react';
import {
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiRadio,
  FiSun,
  FiUpload,
} from 'react-icons/fi';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../theme/ThemeProvider';

const { Header, Sider, Content } = Layout;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { key: '/', label: 'Dashboard', icon: <FiGrid /> },
  { key: '/devices', label: 'Geräte', icon: <FiRadio /> },
  { key: '/import', label: 'Import', icon: <FiUpload /> },
];

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

export function AppLayout() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { mode, toggle } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const menu = (
    <Menu
      mode="inline"
      theme={mode === 'dark' ? 'dark' : 'light'}
      selectedKeys={[location.pathname]}
      items={navItems.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
      }))}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider collapsible breakpoint="lg" theme={mode === 'dark' ? 'dark' : 'light'}>
          <div
            style={{
              height: 48,
              margin: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: mode === 'dark' ? '#fff' : undefined,
              fontWeight: 600,
            }}
          >
            <img
              src="/logo.png"
              alt="radio-admin Logo"
              width={28}
              height={28}
              style={{ borderRadius: 6, flexShrink: 0 }}
            />
            radio-admin
          </div>
          {menu}
        </Sider>
      )}

      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: colorBgContainer,
          }}
        >
          <Space>
            {isMobile && (
              <Button
                type="text"
                aria-label="Menü öffnen"
                icon={<FiMenu />}
                onClick={() => setDrawerOpen(true)}
              />
            )}
            <img
              src="/logo.png"
              alt="radio-admin Logo"
              width={32}
              height={32}
              style={{ borderRadius: 7, flexShrink: 0 }}
            />
            <Typography.Title level={4} style={{ margin: 0 }}>
              radio-admin
            </Typography.Title>
          </Space>

          <Space>
            <Button
              type="text"
              aria-label={mode === 'dark' ? 'Helles Design' : 'Dunkles Design'}
              icon={mode === 'dark' ? <FiSun /> : <FiMoon />}
              onClick={toggle}
            />
            {user && <Typography.Text>{user.name}</Typography.Text>}
            <Button
              type="text"
              aria-label="Abmelden"
              icon={<FiLogOut />}
              onClick={() => {
                void logout();
              }}
            >
              Abmelden
            </Button>
          </Space>
        </Header>

        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>

      {isMobile && (
        <Drawer
          title="Navigation"
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          {menu}
        </Drawer>
      )}
    </Layout>
  );
}
