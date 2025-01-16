import crypto, { Hash } from 'node:crypto';
import fs from 'node:fs';

import { Mocked, mocked } from 'jest-mock';

import { computeIntegrityHash } from './integrity-hash';

jest.mock('node:fs');
jest.mock('node:crypto');
let hashSpy: Mocked<Hash>;

const TEST_FILE_CONTENT = 'ABCDEFGH';
const TEST_FILE_BASE64_DIGEST = 'msIZfZJYJXsa6EY+QhTkzQpXi8FRfyQVkouRvkKD/Eg=';

beforeEach(() => {
  mocked(fs.readFileSync).mockReturnValue(TEST_FILE_CONTENT);

  mocked(crypto.createHash).mockImplementation((algorithm: string) => {
    const hash = (jest.requireActual('node:crypto') as any).createHash(
      algorithm
    );
    jest.spyOn(hash, 'update');
    jest.spyOn(hash, 'digest');
    hashSpy = hash as Mocked<Hash>;
    return hash;
  });
});

describe('computeIntegrityHash', () => {
  test('uses sha256 algorithm', () => {
    computeIntegrityHash('foobar.tar.gz');
    expect(crypto.createHash).toHaveBeenCalledWith('sha256');
  });

  test('hashes the contents of the given file', () => {
    computeIntegrityHash('foobar.tar.gz');
    expect(hashSpy.update).toHaveBeenCalledWith(TEST_FILE_CONTENT);
  });

  test('produces a base64-encoded digest', () => {
    computeIntegrityHash('foobar.tar.gz');
    expect(hashSpy.digest).toHaveBeenCalledWith('base64');
  });

  test("prepends 'sha256-' to the digest", () => {
    const hash = computeIntegrityHash('foobar.tar.gz');

    expect(hash.startsWith('sha256-')).toEqual(true);
  });

  test('produces a correct digest', () => {
    const hash = computeIntegrityHash('foobar.tar.gz');

    expect(hash).toEqual(`sha256-${TEST_FILE_BASE64_DIGEST}`);
  });
});
