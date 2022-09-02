import { expect } from "@jest/globals";

export async function expectThrownError<T extends Error>(
  run: () => any | Promise<any>,
  errorType: new (...args: any[]) => T
): Promise<T> {
  let thrownError: T;
  try {
    await run();
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError!).toBeInstanceOf(errorType);
  return thrownError!;
}
