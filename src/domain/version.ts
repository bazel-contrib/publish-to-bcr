/**
 * Compare bazel module versions
 *
 * Adapted from https://github.com/bazelbuild/bazel-central-registry/blob/127d91703baf4e39eb66fc907d255b37d6162792/tools/registry.py#L85
 */
export function compareVersions(a: string, b: string) {
  return Version.compare(new Version(a), new Version(b));
}

class Version {
  public static compare(a: Version, b: Version): number {
    const result = Version.compareIdentifiers(a.release, b.release);
    if (result) {
      return result;
    }

    if (a.prerelease.length === 0) {
      return 1;
    }
    if (b.prerelease.length === 0) {
      return -1;
    }

    return Version.compareIdentifiers(a.prerelease, b.prerelease);
  }

  private static compareIdentifiers(a: Identifier[], b: Identifier[]) {
    const l = Math.min(a.length, b.length);
    for (let i = 0; i < l; i++) {
      const result = Identifier.compare(a[i], b[i]);
      if (result) {
        return result;
      }
    }

    if (a.length > b.length) {
      return 1;
    } else if (b.length > a.length) {
      return -1;
    }

    return 0;
  }

  private readonly prerelease: Identifier[];
  private readonly release: Identifier[];

  public constructor(version: string) {
    const pattern =
      /^([a-zA-Z0-9.]+)(?:-([a-zA-Z0-9.-]+))?(?:\+[a-zA-Z0-9.-]+)?$/;
    const match = version.match(pattern);
    if (!match) {
      throw new Error(`Invalid module version '${version}'`);
    }

    this.release = this.convertToIdentifiers(match[1]);
    this.prerelease = this.convertToIdentifiers(match[2]);
  }

  private convertToIdentifiers(version: string): Identifier[] {
    return (version && version.split('.').map((i) => new Identifier(i))) || [];
  }
}

class Identifier {
  public static compare(a: Identifier, b: Identifier): number {
    if (typeof a.value !== typeof b.value) {
      if (typeof a.value === 'number') {
        return -1;
      } else {
        return 1;
      }
    }

    if (typeof a.value === 'string') {
      if (a.value < b.value) {
        return -1;
      } else if (a.value === b.value) {
        return 0;
      }
      return 1;
    } else {
      return a.value - (b.value as number);
    }
  }

  private readonly value: string | number;

  public constructor(value: string) {
    const numeric = parseInt(value);
    this.value = /^\d+$/.test(value) ? numeric : value;
  }
}
