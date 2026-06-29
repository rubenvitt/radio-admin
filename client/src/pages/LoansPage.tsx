import { Typography } from 'antd';
import { LoanList } from '../features/loans/LoanList';

export function LoansPage() {
  return (
    <>
      <Typography.Title level={3}>Ausleihen</Typography.Title>
      <LoanList />
    </>
  );
}
