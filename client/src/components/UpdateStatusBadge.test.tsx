import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { UpdateStatusBadge } from './UpdateStatusBadge';

test('renders green "Aktuell" for aktuell', () => {
  render(<UpdateStatusBadge status="aktuell" />);
  const tag = screen.getByText('Aktuell');
  expect(tag).toBeInTheDocument();
  expect(tag.closest('.ant-tag')).toHaveClass('ant-tag-green');
});

test('renders red "Veraltet" for veraltet', () => {
  render(<UpdateStatusBadge status="veraltet" />);
  expect(screen.getByText('Veraltet').closest('.ant-tag')).toHaveClass('ant-tag-red');
});

test('renders grey "Unbekannt" for unbekannt', () => {
  render(<UpdateStatusBadge status="unbekannt" />);
  expect(screen.getByText('Unbekannt').closest('.ant-tag')).toHaveClass('ant-tag-default');
});
