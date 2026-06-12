import { Button, Result } from 'antd';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="Seite nicht gefunden"
      subTitle="Die angeforderte Seite existiert nicht."
      extra={
        <Link to="/">
          <Button type="primary">Zur Startseite</Button>
        </Link>
      }
    />
  );
}
