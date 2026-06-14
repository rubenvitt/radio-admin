import { Button, Drawer, Grid, Layout, Menu, Tooltip, Typography, theme } from 'antd';
import { useState, type ReactNode } from 'react';
import {
  FiGrid,
  FiKey,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiRadio,
  FiRefreshCw,
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
  /** When true, only admins see this nav entry. */
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { key: '/', label: 'Dashboard', icon: <FiGrid /> },
  { key: '/devices', label: 'Geräte', icon: <FiRadio /> },
  { key: '/update', label: 'Update-Modus', icon: <FiRefreshCw /> },
  { key: '/import', label: 'Import', icon: <FiUpload /> },
  { key: '/einstellungen', label: 'API-Zugriff', icon: <FiKey />, adminOnly: true },
];

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

/** Logo + wordmark. Text color follows the theme (no hard-coded colour). */
function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <img
        src="/logo.png"
        alt="radio-admin Logo"
        width={28}
        height={28}
        style={{ borderRadius: 6, flexShrink: 0 }}
      />
      {!collapsed && (
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          radio-admin
        </Typography.Text>
      )}
    </div>
  );
}

export function AppLayout() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { mode, toggle } = useTheme();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, colorBorderSecondary },
  } = theme.useToken();
  const dark = mode === 'dark';

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const menu = (
    <Menu
      mode="inline"
      theme={dark ? 'dark' : 'light'}
      selectedKeys={[location.pathname]}
      style={{ borderInlineEnd: 'none' }}
      items={visibleNavItems.map((item) => ({
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

  // Right-aligned header controls. A flex row (not antd Space) with
  // flex-shrink:0 so the username never wraps under the buttons.
  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <Tooltip title={dark ? 'Helles Design' : 'Dunkles Design'}>
        <Button
          type="text"
          aria-label={dark ? 'Helles Design' : 'Dunkles Design'}
          icon={dark ? <FiSun /> : <FiMoon />}
          onClick={toggle}
        />
      </Tooltip>
      {!isMobile && user && (
        <Typography.Text style={{ maxWidth: 180, whiteSpace: 'nowrap' }} ellipsis>
          {user.name}
        </Typography.Text>
      )}
      <Button
        type="text"
        aria-label="Abmelden"
        icon={<FiLogOut />}
        onClick={() => {
          void logout();
        }}
      >
        {!isMobile && 'Abmelden'}
      </Button>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          breakpoint="lg"
          width={220}
          theme={dark ? 'dark' : 'light'}
          style={{ borderInlineEnd: `1px solid ${colorBorderSecondary}` }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? 0 : '0 16px',
              overflow: 'hidden',
            }}
          >
            <Brand collapsed={collapsed} />
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
            gap: 12,
            padding: '0 16px',
            height: 64,
            lineHeight: 'normal',
            background: colorBgContainer,
            borderBottom: `1px solid ${colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          {/* Left: brand + hamburger on mobile; empty on desktop (the Sider
              already carries the brand, so we don't duplicate it here). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {isMobile && (
              <>
                <Button
                  type="text"
                  aria-label="Menü öffnen"
                  icon={<FiMenu />}
                  onClick={() => setDrawerOpen(true)}
                />
                <Brand />
              </>
            )}
          </div>
          {headerActions}
        </Header>

        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>

      {isMobile && (
        <Drawer
          title={<Brand />}
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={260}
          styles={{ body: { padding: 0 } }}
          footer={
            user ? (
              <Typography.Text type="secondary" ellipsis style={{ display: 'block' }}>
                {user.name}
              </Typography.Text>
            ) : undefined
          }
        >
          {menu}
        </Drawer>
      )}
    </Layout>
  );
}
