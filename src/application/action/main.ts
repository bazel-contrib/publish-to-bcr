import fs from 'node:fs';
import os from 'node:os';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import path from 'path';

interface Inputs {
  githubRepo: string;
  localRegistry: string;
  metadataTemplate: string;
  moduleVersion: string;
  patch: string;
  presubmit: string;
  sourceTemplate: string;
  tag: string;
  templatesDir: string;
}

async function main() {
  try {
    const inputs: Inputs = {
      // GitHub doesn't actually validate inputs that have the `required`
      // property so we need to verify that ourselves with { required: true }.
      // https://github.com/actions/runner/issues/1070
      githubRepo: core.getInput('github-repository'),
      localRegistry: core.getInput('local-registry', { required: true }),
      metadataTemplate: core.getInput('metadata-template'),
      moduleVersion: core.getInput('module-version', { required: true }),
      patch: core.getInput('patch'),
      presubmit: core.getInput('presubmit'),
      sourceTemplate: core.getInput('source-template'),
      tag: core.getInput('tag'),
      templatesDir: core.getInput('templates-dir'),
    };

    const templatesDir = validateAndCreateTemplatesDir(inputs);

    const cliBin = getCliBin();
    const cliArgs = [
      'create-entry',
      `--templates-dir=${templatesDir}`,
      `--local-registry=${inputs.localRegistry}`,
      `--module-version=${inputs.moduleVersion}`,
    ];

    if (inputs.githubRepo) {
      cliArgs.push(`--github-repository=${inputs.githubRepo}`);
    }
    if (inputs.tag) {
      cliArgs.push(`--tag=${inputs.tag}`);
    }

    const code = await exec.exec('node', [cliBin, ...cliArgs]);

    if (code !== 0) {
      core.setFailed(`CLI exited with code ${code}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

function getCliBin(): string {
  const actionBin = process.argv[1];
  return path.join(path.dirname(actionBin), '..', 'cli/index.js');
}

// Copy all templates to a new directory then override them with
// any templates that are inlined as yaml inputs.
function validateAndCreateTemplatesDir(inputs: Inputs): string {
  if (!inputs.templatesDir) {
    const missingTemplateArgs = [];
    if (!inputs.metadataTemplate) {
      missingTemplateArgs.push('metadata-template');
    }
    if (!inputs.sourceTemplate) {
      missingTemplateArgs.push('source-template');
    }
    if (!inputs.presubmit) {
      missingTemplateArgs.push('presubmit');
    }

    if (missingTemplateArgs.length) {
      throw new Error(
        `templates-dir not set so the following args must be supplied: ${missingTemplateArgs.join(', ')}`
      );
    }
  } else {
    if (!fs.existsSync(inputs.templatesDir)) {
      throw new Error(
        `The templates dir ${inputs.templatesDir} does not exist`
      );
    }
  }

  const templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'templates-'));
  if (inputs.templatesDir) {
    fs.cpSync(inputs.templatesDir, templatesDir, { recursive: true });
  }

  if (inputs.metadataTemplate) {
    fs.writeFileSync(
      path.join(templatesDir, 'metadata.template.json'),
      inputs.metadataTemplate,
      'utf8'
    );
  }
  if (inputs.sourceTemplate) {
    fs.writeFileSync(
      path.join(templatesDir, 'source.template.json'),
      inputs.sourceTemplate,
      'utf8'
    );
  }
  if (inputs.presubmit) {
    fs.writeFileSync(
      path.join(templatesDir, 'presubmit.yml'),
      inputs.presubmit,
      'utf8'
    );
  }
  if (inputs.patch) {
    if (!fs.existsSync(path.join(templatesDir, 'patches'))) {
      fs.mkdirSync(path.join(templatesDir, 'patches'));
    }

    fs.writeFileSync(
      path.join(templatesDir, 'patches', '_patch.patch'),
      inputs.patch
    );
  }

  return templatesDir;
}

(async () => {
  await main();
})();
