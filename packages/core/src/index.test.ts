import { expect, it } from 'vitest';
import { CORE_PLACEHOLDER } from './index';

it('exports the M0 placeholder', () => {
  expect(CORE_PLACEHOLDER).toBe(true);
});
