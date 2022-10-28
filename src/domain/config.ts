export interface Configuration {
  readonly fixedReleaser?: FixedReleaser;
}

export interface FixedReleaser {
  readonly login: string;
  readonly email: string;
}
