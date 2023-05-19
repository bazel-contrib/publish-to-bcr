import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { GitHubClient } from "../infrastructure/github";
import { PublishEntryService } from "./publish-entry";
import { Repository } from "./repository";

jest.mock("../infrastructure/github");

let publishEntryService: PublishEntryService;
let mockGithubClient: Mocked<GitHubClient>;
beforeEach(() => {
  mocked(GitHubClient, true).mockClear();
  mockGithubClient = mocked(new GitHubClient());
  publishEntryService = new PublishEntryService(mockGithubClient);
});

describe("sendRequest", () => {
  test("creates a pull request from the bcr fork's provided branch to 'main' on the bcr", async () => {
    const bcrFork = new Repository("bazel-central-registry", "bar");
    const bcr = new Repository("bazel-central-registry", "bazelbuild");
    const branch = "branch_with_entry";
    const tag = "v1.0.0";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };

    await publishEntryService.sendRequest(
      tag,
      bcrFork,
      bcr,
      branch,
      releaser,
      "rules_foo"
    );

    expect(mockGithubClient.createPullRequest).toHaveBeenCalledWith(
      bcrFork,
      branch,
      bcr,
      "main",
      expect.any(String),
      expect.any(String)
    );
  });

  test("includes the module name and release version in the PR title", async () => {
    const bcrFork = new Repository("bazel-central-registry", "bar");
    const bcr = new Repository("bazel-central-registry", "bazelbuild");
    const branch = "branch_with_entry";
    const tag = "v1.0.0";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };

    await publishEntryService.sendRequest(
      tag,
      bcrFork,
      bcr,
      branch,
      releaser,
      "rules_foo"
    );

    expect(mockGithubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(Repository),
      expect.any(String),
      expect.any(Repository),
      expect.any(String),
      expect.stringContaining("rules_foo"),
      expect.any(String)
    );
    expect(mockGithubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(Repository),
      expect.any(String),
      expect.any(Repository),
      expect.any(String),
      expect.stringContaining("1.0.0"),
      expect.any(String)
    );
  });

  test("tags the releaser in the body", async () => {
    const bcrFork = new Repository("bazel-central-registry", "bar");
    const bcr = new Repository("bazel-central-registry", "bazelbuild");
    const branch = "branch_with_entry";
    const tag = "v1.0.0";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };

    await publishEntryService.sendRequest(
      tag,
      bcrFork,
      bcr,
      branch,
      releaser,
      "rules_foo"
    );

    expect(mockGithubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(Repository),
      expect.any(String),
      expect.any(Repository),
      expect.any(String),
      expect.any(String),
      expect.stringContaining(`@${releaser.username}`)
    );
  });

  test("creates the created pull request number", async () => {
    const bcrFork = new Repository("bazel-central-registry", "bar");
    const bcr = new Repository("bazel-central-registry", "bazelbuild");
    const branch = "branch_with_entry";
    const tag = "v1.0.0";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };

    mockGithubClient.createPullRequest.mockResolvedValueOnce(4);

    const pr = await publishEntryService.sendRequest(
      tag,
      bcrFork,
      bcr,
      branch,
      releaser,
      "rules_foo"
    );

    expect(pr).toEqual(4);
  });
});
