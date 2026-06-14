import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { usePersistentState } from './usePersistentState';

afterEach(() => localStorage.clear());

test('reads fallback, then persists and rehydrates', () => {
  const { result, unmount } = renderHook(() => usePersistentState<string[]>('ra-test', ['a']));
  expect(result.current[0]).toEqual(['a']);
  act(() => result.current[1](['a', 'b']));
  expect(JSON.parse(localStorage.getItem('ra-test')!)).toEqual(['a', 'b']);
  unmount();

  const second = renderHook(() => usePersistentState<string[]>('ra-test', ['a']));
  expect(second.result.current[0]).toEqual(['a', 'b']);
});

test('falls back on corrupt stored JSON', () => {
  localStorage.setItem('ra-bad', '{not json');
  const { result } = renderHook(() => usePersistentState('ra-bad', 42));
  expect(result.current[0]).toBe(42);
});
