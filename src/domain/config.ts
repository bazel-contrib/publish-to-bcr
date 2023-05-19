export interface Configuration {
  readonly fixedReleaser?: FixedReleaser;
  readonly moduleRoots: string[];
}

export interface FixedReleaser {
  readonly login: string;
  readonly email: string;
}
