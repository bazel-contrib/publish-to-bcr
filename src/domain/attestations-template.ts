import fs from 'node:fs';

import {
  Artifact,
  ArtifactDownloadError,
  DownloadOptions,
} from './artifact.js';
import { UserFacingError } from './error.js';
import {
  getUnsubstitutedVars,
  SubstitutableVar,
  substituteVars,
} from './substitution.js';

export class AttestationsTemplateError extends Error {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super(message);
  }
}

export class UnsubstitutedAttestationVarsError extends Error {
  constructor(
    public readonly path: string,
    public readonly unsubstituted: Set<SubstitutableVar>
  ) {
    super();
  }
}

export class AttestationDownloadError extends UserFacingError {
  constructor(
    public readonly url: string,
    public readonly statusCode: number
  ) {
    let msg = `Failed to download attestation from ${url}. Received status ${statusCode}.`;

    if (statusCode === 404) {
      msg +=
        "\n\nDouble check that the `url` in your ruleset's .bcr/attestations.template.json is correct.";
    }
    super(msg);
  }
}

export class AttestationsTemplate {
  // Preserve the original parse JSON structure. It's up to the
  // user to provider a correct template. We only parse and validate
  // the fields that Publish to BCR cares about.
  private json: Record<string, unknown>;

  public static tryLoad(filePath: string): AttestationsTemplate | null {
    if (fs.existsSync(filePath)) {
      return new AttestationsTemplate(filePath);
    }
    return null;
  }

  private constructor(private readonly filePath: string) {
    this.parseAndValidate(this.filePath);
  }

  // Perform a minimal validation of the attestation fields that Publish
  // to BCR needs to work with. It's up to the user to provide a correctly
  // structure attestations document.
  private parseAndValidate(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.json = JSON.parse(content);
    } catch (e) {
      throw new AttestationsTemplateError(this.filePath, e.message);
    }

    if (!this.json.attestations) {
      throw new AttestationsTemplateError(
        this.filePath,
        'missing attestations field'
      );
    }

    if (!isObject(this.json.attestations)) {
      throw new AttestationsTemplateError(
        this.filePath,
        'invalid attestations field'
      );
    }

    for (const key of Object.keys(this.json.attestations)) {
      const attestation = (this.json.attestations as any)[key];
      if (!isObject(attestation)) {
        throw new AttestationsTemplateError(
          this.filePath,
          `invalid attestation with key ${key}`
        );
      }

      if (!attestation.url) {
        throw new AttestationsTemplateError(
          this.filePath,
          `attestation with key ${key} is missing url`
        );
      }

      if (typeof attestation.url !== 'string') {
        throw new AttestationsTemplateError(
          this.filePath,
          `attestation with key ${key} has invalid url`
        );
      }
    }
  }

  public substitute(
    vars: Partial<Record<SubstitutableVar, string>>
  ): AttestationsTemplate {
    // Substitute the url field of all attestations
    for (const key of Object.keys(this.json.attestations)) {
      const attestation = (this.json.attestations as any)[key];
      attestation.url = substituteVars(attestation.url, vars);
    }

    // Substitute the attestation keys
    for (const key of Object.keys(this.json.attestations)) {
      const subbedKey = substituteVars(key, vars);
      if (subbedKey !== key) {
        (this.json.attestations as any)[subbedKey] = (
          this.json.attestations as any
        )[key];
        delete (this.json.attestations as any)[key];
      }
    }

    return this;
  }

  public validateFullySubstituted(): void {
    const unsubstituted = new Set<SubstitutableVar>();

    for (const key of Object.keys(this.json.attestations)) {
      getUnsubstitutedVars(key).forEach((v) => unsubstituted.add(v));
      const attestation = (this.json.attestations as any)[key];
      getUnsubstitutedVars(attestation.url as string).forEach((v) =>
        unsubstituted.add(v)
      );
    }

    if (unsubstituted.size > 0) {
      throw new UnsubstitutedAttestationVarsError(this.filePath, unsubstituted);
    }
  }

  public async computeIntegrityHashes(
    downloadOptions: DownloadOptions
  ): Promise<void> {
    const urls: string[] = [];
    const keys = Object.keys(this.json.attestations);

    for (const key of keys) {
      const attestation = (this.json.attestations as any)[key];
      urls.push(attestation.url);
    }

    const artifacts = urls.map((url) => new Artifact(url));

    try {
      await Promise.all(
        artifacts.map((artifact) => artifact.download(downloadOptions))
      );
    } catch (e) {
      if (e instanceof ArtifactDownloadError) {
        throw new AttestationDownloadError(e.url, e.statusCode);
      }
      throw e;
    }

    for (let i = 0; i < keys.length; i++) {
      const attestation = (this.json.attestations as any)[keys[i]];
      attestation.integrity = artifacts[i].computeIntegrityHash();
    }
  }

  public save(destPath: string) {
    fs.writeFileSync(
      destPath,
      `${JSON.stringify(this.json, undefined, 4)}\n`,
      'utf8'
    );
  }
}

function isObject(x: any): boolean {
  // https://stackoverflow.com/a/8511350
  return typeof x === 'object' && !Array.isArray(x) && x !== null;
}
