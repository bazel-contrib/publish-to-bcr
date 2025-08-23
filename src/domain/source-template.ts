import fs from 'node:fs';

import {
  getUnsubstitutedVars,
  SubstitutableVar,
  substituteVars,
} from './substitution.js';

export class SourceTemplateError extends Error {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super(message);
  }
}

export class UnsubstitutedVarsError extends Error {
  constructor(
    public readonly path: string,
    public readonly unsubstituted: Set<SubstitutableVar>
  ) {
    super();
  }
}

export class SourceTemplate {
  private sourceJson: Record<string, unknown>;

  constructor(private readonly filePath: string) {
    this.parseAndValidate(this.filePath);
  }

  private parseAndValidate(filePath: string) {
    try {
      const sourceContent = fs.readFileSync(filePath, 'utf8');
      this.sourceJson = JSON.parse(sourceContent);
    } catch (e) {
      throw new SourceTemplateError(this.filePath, e.message);
    }

    if (
      'strip_prefix' in this.sourceJson &&
      typeof this.sourceJson.strip_prefix !== 'string'
    ) {
      throw new SourceTemplateError(
        this.filePath,
        'invalid strip_prefix field'
      );
    }

    if (!this.sourceJson.url) {
      throw new SourceTemplateError(this.filePath, 'missing url field');
    }

    if (typeof this.sourceJson.url !== 'string') {
      throw new SourceTemplateError(this.filePath, 'invalid url field');
    }
  }

  // Substitute variables into the templated source.json
  public substitute(
    vars: Partial<Record<SubstitutableVar, string>>
  ): SourceTemplate {
    for (const prop of ['docs_url', 'url', 'strip_prefix'].filter(
      (prop) => prop in this.sourceJson
    )) {
      this.sourceJson[prop] = substituteVars(
        this.sourceJson[prop] as string,
        vars
      );
    }

    return this;
  }

  public validateFullySubstituted(): void {
    const unsubstituted = new Set<SubstitutableVar>();
    for (const prop of ['docs_url', 'url', 'strip_prefix'].filter(
      (prop) => prop in this.sourceJson
    )) {
      getUnsubstitutedVars(this.sourceJson[prop] as string).forEach((v) =>
        unsubstituted.add(v)
      );
    }

    if (unsubstituted.size > 0) {
      throw new UnsubstitutedVarsError(this.filePath, unsubstituted);
    }
  }

  public setIntegrityHash(integrityHash: string) {
    this.sourceJson.integrity = integrityHash;
  }

  public addPatch(
    patchName: string,
    patchIntegrity: string,
    patchStrip: number
  ) {
    this.sourceJson.patches = this.sourceJson.patches || {};
    (this.sourceJson.patches as any)[patchName] = patchIntegrity;
    this.sourceJson.patch_strip = patchStrip;
  }

  public save(destPath: string) {
    fs.writeFileSync(
      destPath,
      `${JSON.stringify(this.sourceJson, undefined, 4)}\n`
    );
  }

  public get url(): string {
    return this.sourceJson.url as string;
  }

  public get stripPrefix(): string {
    return (this.sourceJson.strip_prefix as string) || '';
  }
}
