import { expect } from '@jest/globals';
import { toThrowWithMessage } from 'jest-extended';
expect.extend({ toThrowWithMessage });

expect.extend({
  matchesPredicate(actual: any, predicate: (actual: any) => boolean) {
    return {
      pass: predicate(actual),
      message: () => 'Expected object that passes predicate',
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect {
      matchesPredicate(predicate: (actual: any) => boolean): any;
    }
  }
}

export default undefined;
