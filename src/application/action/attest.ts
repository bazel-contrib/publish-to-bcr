import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import * as ghAttest from '@actions/attest';

import { CreateEntryCommandOutput } from '../cli/create-entry-command';
import { Inputs } from './main';

export async function attest(
  inputs: Inputs,
  cliOutput: CreateEntryCommandOutput
) {
  if (inputs.attest) {
    if (!inputs.attestationsDest) {
      throw new Error('attestations-dest must be set when attest is true');
    }
    if (!inputs.ghToken) {
      throw new Error('gh-token must be set to produce attestations');
    }

    for (const module of cliOutput.modules) {
      await attestEntryFiles(
        module.entryPath,
        inputs.attestationsDest,
        inputs.ghToken,
        cliOutput.modules.length > 1 ? module.name : null
      );
    }
  }
}

async function attestEntryFiles(
  entryPath: string,
  attestationsDest: string,
  ghToken: string,
  prefix: string | null
) {
  if (!fs.existsSync(attestationsDest)) {
    fs.mkdirSync(attestationsDest, { recursive: true });
  }

  for (const artifact of ['MODULE.bazel', 'source.json']) {
    await attestArtifact(
      artifact,
      path.join(entryPath, artifact),
      path.join(
        attestationsDest,
        `${prefix !== null ? `${prefix}.` : ''}${artifact}.intoto.jsonl`
      ),
      ghToken
    );
  }
}

async function attestArtifact(
  artifactName: string,
  artifactPath: string,
  dest: string,
  ghToken: string
) {
  // The digest must be a hex-encoded value
  // https://github.com/actions/toolkit/tree/main/packages/attest#usage
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(artifactPath));
  const digest = hash.digest('hex');

  const attestation = await ghAttest.attestProvenance({
    subjects: [
      {
        name: artifactName,
        digest: {
          sha256: digest,
        },
      },
    ],
    token: ghToken,
  });

  fs.writeFileSync(dest, JSON.stringify(attestation.bundle), 'utf-8');
}
