import { Button, Result } from 'antd';

export function LoginPage() {
  return (
    <Result
      title="Nicht angemeldet"
      subTitle="Für den Zugriff auf radio-admin ist eine Anmeldung erforderlich."
      extra={
        <Button type="primary" href="/api/auth/login">
          Anmelden
        </Button>
      }
    />
  );
}
