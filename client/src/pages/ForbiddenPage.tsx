import { Result } from 'antd';

export function ForbiddenPage() {
  return (
    <Result
      status="403"
      title="Zugriff verweigert"
      subTitle="Ihrem Konto ist keine Rolle zugeordnet. Bitte wenden Sie sich an einen Administrator."
    />
  );
}
