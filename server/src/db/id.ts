import { createId } from '@paralleldrive/cuid2';

/** Generate a new cuid2 primary-key id (24 lowercase alphanumeric chars). */
export function newId(): string {
  return createId();
}
