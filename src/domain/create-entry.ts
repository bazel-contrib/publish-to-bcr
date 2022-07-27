import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import os from "node:os";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";
import { GitHubClient } from "../infrastructure/github.js";
import { GitClient } from "../infrastructure/git.js";

export class CreateEntryService {
  constructor(
    private readonly gitClient: GitClient,
    private readonly githubClient: GitHubClient
  ) {}

  public async newEntry(
    rulesetRepo: RulesetRepository,
    bcrForkRepo: Repository,
    bcr: Repository,
    tag: string
  ): Promise<string> {
    await Promise.all([rulesetRepo.checkout("main"), bcr.checkout("main")]);

    await this.createEntryFiles(rulesetRepo, bcr, tag);
    const branchName = await this.commitEntry(rulesetRepo, bcr, tag);
    await this.pushEntry(bcrForkRepo, bcr, branchName);

    return branchName;
  }

  private async createEntryFiles(
    rulesetRepo: RulesetRepository,
    bcrRepo: Repository,
    tag: string
  ): Promise<void> {
    const version = getVersionFromTag(tag);
    const moduleName = getModuleName(rulesetRepo.moduleFilePath);
    const bcrEntryPath = path.resolve(bcrRepo.diskPath, "modules", moduleName);
    const bcrVersionEntryPath = path.join(bcrEntryPath, version);

    if (!fs.existsSync(bcrEntryPath)) {
      fs.mkdirSync(bcrEntryPath);
    }

    updateMetadataFile(
      rulesetRepo.metadataTemplatePath,
      path.join(bcrEntryPath, "metadata.json"),
      version
    );

    fs.mkdirSync(bcrVersionEntryPath);

    stampModuleFile(
      rulesetRepo.moduleFilePath,
      path.join(bcrVersionEntryPath, "MODULE.bazel"),
      version
    );

    await stampSourceFile(
      rulesetRepo.sourceTemplatePath,
      path.join(bcrVersionEntryPath, "source.json"),
      rulesetRepo,
      version,
      tag
    );

    fs.copyFileSync(
      rulesetRepo.presubmitPath,
      path.join(bcrVersionEntryPath, "presubmit.yml")
    );
  }

  private async commitEntry(
    rulesetRepo: Repository,
    bcrRepo: Repository,
    tag: string
  ): Promise<string> {
    const repoAndVersion = `${rulesetRepo.canonicalName}@${tag}`;
    const branchName = repoAndVersion;

    await this.gitClient.setUserNameAndEmail(
      bcrRepo.diskPath,
      "Publish to BCR",
      "noreply@aspect.dev"
    );
    await this.gitClient.checkoutNewBranchFromHead(
      bcrRepo.diskPath,
      branchName
    );
    await this.gitClient.commitChanges(
      bcrRepo.diskPath,
      `Publish ${repoAndVersion}`
    );

    return branchName;
  }

  private async pushEntry(
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string
  ): Promise<void> {
    const authenticatedRemoteUrl =
      await this.githubClient.getAuthenticatedRemoteUrl(bcrForkRepo);

    await this.gitClient.addRemote(
      bcr.diskPath,
      "authed-fork",
      authenticatedRemoteUrl
    );
    await this.gitClient.push(bcr.diskPath, "authed-fork", branch);
  }
}

function getModuleName(modulePath: string): string {
  const moduleContent = fs.readFileSync(modulePath, { encoding: "utf-8" });

  const regex = /module\(.*?name\s*=\s*"(\w+)"/s;
  const match = moduleContent.match(regex);
  if (match) {
    return match[1];
  }
  throw new Error("Could not parse module name from module file");
}

function updateMetadataFile(
  sourcePath: string,
  destPath: string,
  version: string
) {
  let publishedVersions = [];
  if (fs.existsSync(destPath)) {
    const existingMetadata = JSON.parse(
      fs.readFileSync(destPath, { encoding: "utf-8" })
    );
    publishedVersions = existingMetadata.versions;
  }

  if (publishedVersions.includes(version)) {
    console.error(`Version ${version} is already published to this registry`);
    process.exit(1);
  }

  const metadata = JSON.parse(
    fs.readFileSync(sourcePath, {
      encoding: "utf-8",
    })
  );
  metadata.versions = [...publishedVersions, version];

  fs.writeFileSync(destPath, JSON.stringify(metadata, null, 4) + "\n");
}

function stampModuleFile(
  sourcePath: string,
  destPath: string,
  version: string
) {
  const module = fs.readFileSync(sourcePath, { encoding: "utf-8" });

  const stampedModule = module.replace(
    /(^.*?module\(.*?version\s*=\s*")[\w.]+(".*$)/s,
    `$1${version}$2`
  );

  fs.writeFileSync(destPath, stampedModule, {
    encoding: "utf-8",
  });
}

async function stampSourceFile(
  sourcePath: string,
  destPath: string,
  rulesetRepo: Repository,
  version: string,
  tag: string
): Promise<void> {
  // Substitute variables into source.json
  const sourceContent = fs.readFileSync(sourcePath, { encoding: "utf-8" });
  const substituted = sourceContent
    .replace(/{REPO}/g, rulesetRepo.name)
    .replace(/{OWNER}/g, rulesetRepo.owner)
    .replace(/{VERSION}/g, version)
    .replace(/{TAG}/g, tag);

  // Compute the integrity hash
  const sourceJson = JSON.parse(substituted);
  const filename = sourceJson.url.substring(
    sourceJson.url.lastIndexOf("/") + 1
  );

  console.log(`Downloading archive ${sourceJson.url}`);
  const downloadedPath = path.join(os.tmpdir(), filename);
  await download(sourceJson.url, downloadedPath);

  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(downloadedPath));
  const digest = hash.digest("base64");
  sourceJson.integrity = `sha256-${digest}`;

  fs.writeFileSync(destPath, JSON.stringify(sourceJson, undefined, 4), {
    encoding: "utf-8",
  });
}

function getVersionFromTag(version: string): string {
  if (version.startsWith("v")) {
    return version.substring(1);
  }
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(dest, { flags: "wx" });
        file.on("finish", () => resolve());
        file.on("error", (err) => {
          file.close();
          fs.unlink(dest, () => reject(err.message));
          reject(err);
        });
        response.pipe(file);
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Redirect
        download(response.headers.location, dest).then(() => resolve());
      } else {
        reject(
          `Server responded with ${response.statusCode}: ${response.statusMessage}`
        );
      }
    });

    request.on("error", (err) => {
      reject(err.message);
    });
  });
}
