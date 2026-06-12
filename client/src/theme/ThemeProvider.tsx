import { ConfigProvider, theme as antdTheme } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'ra-theme';

function readInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggle = useCallback(
    () => setModeState((m) => (m === 'dark' ? 'light' : 'dark')),
    [],
  );

  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm:
            mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: { colorPrimary: '#1677ff', borderRadius: 8 },
          components: {
            // High-contrast selected item in the dark Sider menu (white on the
            // primary blue) instead of the low-contrast default.
            Menu: {
              darkItemSelectedBg: '#1677ff',
              darkItemSelectedColor: '#ffffff',
              itemSelectedBg: '#e6f0ff',
              itemSelectedColor: '#1677ff',
            },
          },
        }}
      >
        <BodyBackground />
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

/**
 * Paints the document body with the theme's layout background so the area outside
 * the app (overscroll, any gaps) matches light/dark instead of staying white.
 */
function BodyBackground() {
  const { token } = antdTheme.useToken();
  useEffect(() => {
    document.body.style.background = token.colorBgLayout;
  }, [token.colorBgLayout]);
  return null;
}
