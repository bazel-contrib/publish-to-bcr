import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { GitHubClient } from "../infrastructure/github";
import { Repository } from "./repository";
import { PublishEntryService } from "./publish-entry";

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
    const rulesetRepo = new Repository("foo", "bar");
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
      rulesetRepo,
      tag,
      bcrFork,
      bcr,
      branch,
      releaser
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

  test("includes the ruleset repository name and tag in the PR title", async () => {
    const rulesetRepo = new Repository("foo", "bar");
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
      rulesetRepo,
      tag,
      bcrFork,
      bcr,
      branch,
      releaser
    );

    expect(mockGithubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(Repository),
      expect.any(String),
      expect.any(Repository),
      expect.any(String),
      expect.stringContaining(`${rulesetRepo.canonicalName}`),
      expect.any(String)
    );
    expect(mockGithubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(Repository),
      expect.any(String),
      expect.any(Repository),
      expect.any(String),
      expect.stringContaining(`${tag}`),
      expect.any(String)
    );
  });

  test("tags the releaser in the body", async () => {
    const rulesetRepo = new Repository("foo", "bar");
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
      rulesetRepo,
      tag,
      bcrFork,
      bcr,
      branch,
      releaser
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
    const rulesetRepo = new Repository("foo", "bar");
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
      rulesetRepo,
      tag,
      bcrFork,
      bcr,
      branch,
      releaser
    );

    expect(pr).toEqual(4);
  });
});
