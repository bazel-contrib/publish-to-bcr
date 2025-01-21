import fs from 'node:fs';

import yaml from 'yaml';

export class MissingConfigurationFileError extends Error {
  constructor(public readonly filepath: string) {
    super(`Could not find configuration file at ${filepath}`);
  }
}

export class InvalidConfigurationFileError extends Error {
  constructor(
    public readonly filepath: string,
    public readonly reason: string
  ) {
    super(`Invalid configuration file at ${filepath}: ${reason}`);
  }
}

export class Configuration {
  public static readonly DEFAULT_MODULE_ROOTS = ['.'];

  public static fromFile(filepath: string): Configuration {
    if (!fs.existsSync(filepath)) {
      throw new MissingConfigurationFileError(filepath);
    }

    let config: Record<string, any>;
    try {
      config = yaml.parse(fs.readFileSync(filepath, 'utf-8')) || {};
    } catch {
      throw new InvalidConfigurationFileError(
        filepath,
        'cannot parse file as yaml'
      );
    }

    if (
      config.fixedReleaser &&
      (typeof config.fixedReleaser !== 'object' ||
        typeof config.fixedReleaser.login !== 'string' ||
        typeof config.fixedReleaser.email !== 'string')
    ) {
      throw new InvalidConfigurationFileError(
        filepath,
        "could not parse 'fixedReleaser'"
      );
    }

    if (
      config.moduleRoots !== undefined &&
      (!Array.isArray(config.moduleRoots) ||
        !config.moduleRoots.every((value) => typeof value === 'string'))
    ) {
      throw new InvalidConfigurationFileError(
        filepath,
        "could not parse 'moduleRoots'"
      );
    }

    config.moduleRoots =
      config.moduleRoots || Configuration.DEFAULT_MODULE_ROOTS;

    return new Configuration(config.moduleRoots, config.fixedReleaser);
  }

  public static defaults(): Configuration {
    return new Configuration(Configuration.DEFAULT_MODULE_ROOTS);
  }

  private constructor(
    public readonly moduleRoots: string[],
    public readonly fixedReleaser?: FixedReleaser
  ) {}
}

export interface FixedReleaser {
  readonly login: string;
  readonly email: string;
}
