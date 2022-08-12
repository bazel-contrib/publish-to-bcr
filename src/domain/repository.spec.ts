import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mocked } from "jest-mock";
import os from "node:os";
import { GitClient } from "../infrastructure/git";
import { Repository } from "./repository";

jest.mock("../infrastructure/git");

beforeEach(() => {
  mocked(GitClient, true).mockClear();
  Repository.gitClient = new GitClient();
});

describe("fromCanonicalName", () => {
  test("creates correct repository", () => {
    const repository = Repository.fromCanonicalName("foo/bar");
    expect(repository.canonicalName).toEqual("foo/bar");
    expect(repository.owner).toEqual("foo");
    expect(repository.name).toEqual("bar");
  });
});

describe("canonicalName", () => {
  test("is owner slash repo", () => {
    const repository = new Repository("bar", "foo");
    expect(repository.canonicalName).toEqual("foo/bar");
  });
});

describe("diskPath", () => {
  test("throws when not checked out", () => {
    const repository = new Repository("foo", "bar");
    expect(() => repository.diskPath).toThrow();
  });

  test("does not throw when checked out", async () => {
    const repository = new Repository("foo", "bar");
    await repository.checkout();
    expect(() => repository.diskPath).not.toThrow();
  });

  test("is in the temp dir", async () => {
    const repository = new Repository("foo", "bar");
    await repository.checkout();
    expect(repository.diskPath.startsWith(os.tmpdir())).toEqual(true);
  });

  test("is a unique path", async () => {
    const repositoryA = new Repository("foo", "bar");
    await repositoryA.checkout();

    const repositoryB = new Repository("foo", "bar");
    await repositoryB.checkout();

    expect(repositoryA.diskPath).not.toEqual(repositoryB.diskPath);
  });
});

describe("checkout", () => {
  test("clones and checks out the repository", async () => {
    const repository = new Repository("foo", "bar");
    await repository.checkout("main");
    expect(Repository.gitClient.clone).toHaveBeenCalledWith(
      repository.url,
      repository.diskPath
    );
    expect(Repository.gitClient.checkout).toHaveBeenCalledWith(
      repository.diskPath,
      "main"
    );
  });

  test("clones and checks out the default branch when branch not specified", async () => {
    const repository = new Repository("foo", "bar");
    await repository.checkout();
    expect(Repository.gitClient.clone).toHaveBeenCalledWith(
      repository.url,
      repository.diskPath
    );
    expect(Repository.gitClient.checkout).toHaveBeenCalledWith(
      repository.diskPath,
      undefined
    );
  });
});

describe("isCheckedOut", () => {
  test("false when not checked out", () => {
    const repository = new Repository("foo", "bar");
    expect(repository.isCheckedOut()).toEqual(false);
  });

  test("true when checked out", async () => {
    const repository = new Repository("foo", "bar");
    await repository.checkout();
    expect(repository.isCheckedOut()).toEqual(true);
  });
});

describe("equals", () => {
  test("true when two repositories have the same owner and name", () => {
    const a = new Repository("foo", "bar");
    const b = new Repository("foo", "bar");
    expect(a.equals(b)).toEqual(true);
  });

  test("true when one is checked out", async () => {
    const a = new Repository("foo", "bar");
    await a.checkout();
    const b = new Repository("foo", "bar");
    expect(a.equals(b)).toEqual(true);
  });

  test("false when two repositories have different name", () => {
    const a = new Repository("foo", "bar");
    const b = new Repository("moo", "bar");
    expect(a.equals(b)).toEqual(false);
  });

  test("false when two repositories have different owner", () => {
    const a = new Repository("foo", "bar");
    const b = new Repository("foo", "cow");
    expect(a.equals(b)).toEqual(false);
  });

  test("commutative", () => {
    const a = new Repository("foo", "bar");
    const b = new Repository("foo", "bar");

    expect(a.equals(b)).toEqual(true);
    expect(b.equals(a)).toEqual(true);
  });

  test("idempotent", () => {
    const a = new Repository("foo", "bar");

    expect(a.equals(a)).toEqual(true);
  });
});
