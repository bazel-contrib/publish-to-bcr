import {
  getUnsubstitutedVars,
  SubstitutableVar,
  substituteVars,
} from './substitution';

describe('substituteVars', () => {
  test('substitutes a variable', () => {
    const str = 'The repo is {REPO}';
    const sub = substituteVars(str, { REPO: 'foo' });

    expect(sub).toEqual('The repo is foo');
  });

  test('substitutes duplicates of a variable', () => {
    const str = 'The repo is {REPO}. Yes, it is {REPO}.';
    const sub = substituteVars(str, { REPO: 'foo' });

    expect(sub).toEqual('The repo is foo. Yes, it is foo.');
  });

  test('substitutes multiple variables', () => {
    const str = 'The repo is {REPO}. The owner is {OWNER}.';
    const sub = substituteVars(str, { REPO: 'foo', OWNER: 'bar' });

    expect(sub).toEqual('The repo is foo. The owner is bar.');
  });

  test('does not substitute an unknown variable', () => {
    const str = 'The meaning of life is {UNKNOWN}.';
    const sub = substituteVars(str, { REPO: 'foo' });

    expect(sub).toEqual('The meaning of life is {UNKNOWN}.');
  });
});

describe('getUnsubstitutedVars', () => {
  test('gets an unsubstituted var', () => {
    const str = 'The repo is {REPO}';
    const vars = getUnsubstitutedVars(str);

    expect(vars.size).toEqual(1);
    expect(vars.has(SubstitutableVar.REPO)).toBe(true);
  });

  test('gets duplicated unsubstituted var', () => {
    const str = 'The repo is {REPO}. Yes, it is {REPO}.';
    const vars = getUnsubstitutedVars(str);

    expect(vars.size).toEqual(1);
    expect(vars.has(SubstitutableVar.REPO)).toBe(true);
  });

  test('gets an multiple ubsubstituted vars', () => {
    const str = 'The repo is {REPO}. The owner is {OWNER}.';
    const vars = getUnsubstitutedVars(str);

    expect(vars.size).toEqual(2);
    expect(vars.has(SubstitutableVar.REPO)).toBe(true);
    expect(vars.has(SubstitutableVar.OWNER)).toBe(true);
  });

  test('does not get unknown vars', () => {
    const str = 'The meaning of life is {UNKNOWN}.';
    const vars = getUnsubstitutedVars(str);

    expect(vars.size).toEqual(0);
  });
});
