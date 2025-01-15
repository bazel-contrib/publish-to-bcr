import fs from 'node:fs';

export class InvalidSourceTemplateError extends Error {
  constructor(reason: string) {
    super(`Invalid source.template.json file: ${reason}`);
  }
}

export class SourceTemplate {
  private sourceJson: Record<string, unknown>;

  constructor(private readonly filePath: string) {
    this.parseAndValidate(filePath);
  }

  private parseAndValidate(filePath: string) {
    try {
      const sourceContent = fs.readFileSync(filePath, 'utf8');
      this.sourceJson = JSON.parse(sourceContent);
    } catch (error) {
      throw new InvalidSourceTemplateError('cannot parse file as json');
    }

    if (
      'strip_prefix' in this.sourceJson &&
      typeof this.sourceJson.strip_prefix !== 'string'
    ) {
      throw new InvalidSourceTemplateError('invalid strip_prefix field');
    }

    if (!this.sourceJson.url) {
      throw new InvalidSourceTemplateError('missing url field');
    }

    if (typeof this.sourceJson.url !== 'string') {
      throw new InvalidSourceTemplateError('invalid url field');
    }
  }

  // Substitute variables into the templated source.json
  public substitute(
    repoOwner: string,
    repoName: string,
    tag: string,
    version: string
  ) {
    for (let prop of ['url', 'strip_prefix'].filter(
      (prop) => prop in this.sourceJson
    )) {
      this.sourceJson[prop] = this.replaceVariables(
        this.sourceJson[prop] as string,
        repoOwner,
        repoName,
        tag,
        version
      );
    }
  }

  private replaceVariables(
    str: string,
    repoOwner: string,
    repoName: string,
    tag: string,
    version: string
  ) {
    return str
      .replace(/{OWNER}/g, repoOwner)
      .replace(/{REPO}/g, repoName)
      .replace(/{VERSION}/g, version)
      .replace(/{TAG}/g, tag);
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
