import { Typography } from 'antd';
import { ImportWizard } from '../features/import/ImportWizard';

export function ImportPage() {
  return (
    <>
      <Typography.Title level={3}>CSV-Import</Typography.Title>
      <ImportWizard />
    </>
  );
}
