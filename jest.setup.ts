declare global {
  namespace jest {
    interface Matchers<R> {
      toThrowErrorContaining<T extends Error>(
        errorType: new (...args: any[]) => T,
        message: string
      ): R;
    }
  }
}

expect.extend({
  toThrowErrorContaining<T extends Error>(
    func: Function,
    errorType: new (...args: any[]) => T,
    message: string
  ) {
    try {
      func();
    } catch (e) {
      if (!(e instanceof errorType)) {
        return {
          pass: false,
          message: () => `\
Expected error to throw:

    ${errorType}

But instead it threw:

    ${e.constructor}
`,
        };
      }

      if (!e.message.includes(message)) {
        return {
          pass: false,
          message: () => `\
Expected error message to contain:

    ${message}

But instead it was:

    ${e.message}
`,
        };
      }

      return {
        pass: true,
        message: () => "",
      };
    }

    return {
      pass: false,
      message: () => "Expected function to throw but it did not",
    };
  },
});

export default undefined;
