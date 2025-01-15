import { mocked } from 'jest-mock';
import os from 'node:os';
import { GitClient } from '../infrastructure/git';
import { Repository } from './repository';

jest.mock('../infrastructure/git');

describe('fromCanonicalName', () => {
  test('creates correct repository', () => {
    const repository = Repository.fromCanonicalName('foo/bar');
    expect(repository.canonicalName).toEqual('foo/bar');
    expect(repository.owner).toEqual('foo');
    expect(repository.name).toEqual('bar');
  });
});

describe('canonicalName', () => {
  test('is owner slash repo', () => {
    const repository = new Repository('bar', 'foo');
    expect(repository.canonicalName).toEqual('foo/bar');
  });
});

describe('diskPath', () => {
  test('is a temp dir', async () => {
    const repository = new Repository('foo', 'bar');
    await repository.shallowCloneAndCheckout();
    expect(repository.diskPath.startsWith(os.tmpdir())).toEqual(true);
  });

  test('is a unique path', async () => {
    const repositoryA = new Repository('foo', 'bar');
    await repositoryA.shallowCloneAndCheckout();

    const repositoryB = new Repository('foo', 'bar');
    await repositoryB.shallowCloneAndCheckout();

    expect(repositoryA.diskPath).not.toEqual(repositoryB.diskPath);
  });
});

describe('shallowCloneAndCheckout', () => {
  test('clones the repository at the specified branch ', async () => {
    const repository = new Repository('foo', 'bar');
    await repository.shallowCloneAndCheckout('main');

    const mockGitClient = mocked(GitClient).mock.instances[0];
    expect(mockGitClient.shallowClone).toHaveBeenCalledWith(
      repository.url,
      repository.diskPath,
      'main'
    );
  });

  test('clones and checks out the default branch when branch not specified', async () => {
    const repository = new Repository('foo', 'bar');
    await repository.shallowCloneAndCheckout();
    const mockGitClient = mocked(GitClient).mock.instances[0];
    expect(mockGitClient.shallowClone).toHaveBeenCalledWith(
      repository.url,
      repository.diskPath,
      undefined
    );
  });
});

describe('isCheckedOut', () => {
  test('false when not checked out', () => {
    const repository = new Repository('foo', 'bar');
    expect(repository.isCheckedOut()).toEqual(false);
  });

  test('true when checked out', async () => {
    const repository = new Repository('foo', 'bar');
    await repository.shallowCloneAndCheckout();
    expect(repository.isCheckedOut()).toEqual(true);
  });
});

describe('equals', () => {
  test('true when two repositories have the same owner and name', () => {
    const a = new Repository('foo', 'bar');
    const b = new Repository('foo', 'bar');
    expect(a.equals(b)).toEqual(true);
  });

  test('true when one is checked out', async () => {
    const a = new Repository('foo', 'bar');
    await a.shallowCloneAndCheckout();
    const b = new Repository('foo', 'bar');
    expect(a.equals(b)).toEqual(true);
  });

  test('false when two repositories have different name', () => {
    const a = new Repository('foo', 'bar');
    const b = new Repository('moo', 'bar');
    expect(a.equals(b)).toEqual(false);
  });

  test('false when two repositories have different owner', () => {
    const a = new Repository('foo', 'bar');
    const b = new Repository('foo', 'cow');
    expect(a.equals(b)).toEqual(false);
  });

  test('commutative', () => {
    const a = new Repository('foo', 'bar');
    const b = new Repository('foo', 'bar');

    expect(a.equals(b)).toEqual(true);
    expect(b.equals(a)).toEqual(true);
  });

  test('idempotent', () => {
    const a = new Repository('foo', 'bar');

    expect(a.equals(a)).toEqual(true);
  });
});
