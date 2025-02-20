import fs from 'node:fs';
import path from 'node:path';

import * as ghAttest from '@actions/attest';

import { computeIntegrityHash } from '../../domain/integrity-hash';
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
    await attestEntryFiles(
      cliOutput.entryPath,
      inputs.attestationsDest,
      inputs.ghToken
    );
  }
}

async function attestEntryFiles(
  entryPath: string,
  attestationsDest: string,
  ghToken: string
) {
  if (!fs.existsSync(attestationsDest)) {
    fs.mkdirSync(attestationsDest, { recursive: true });
  }

  for (const artifact of ['MODULE.bazel', 'source.json']) {
    await attestArtifact(
      artifact,
      path.join(entryPath, artifact),
      attestationsDest,
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
  const attestation = await ghAttest.attestProvenance({
    subjects: [
      {
        name: artifactName,
        digest: { sha256: computeIntegrityHash(artifactPath) },
      },
    ],
    token: ghToken,
  });

  fs.writeFileSync(
    path.join(dest, `${artifactName}.intoto.jsonl`),
    JSON.stringify(attestation.bundle),
    'utf-8'
  );
}
