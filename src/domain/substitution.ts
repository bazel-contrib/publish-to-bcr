// export type SubstitutableVar = 'OWNER' | 'REPO' | 'TAG' | 'VERSION';

export enum SubstitutableVar {
  OWNER = 'OWNER',
  REPO = 'REPO',
  TAG = 'TAG',
  VERSION = 'VERSION',
}

export const ALL_SUBSTITUTABLE_VARS = Object.values(SubstitutableVar);

export function substituteVars(
  str: string,
  vars: Partial<Record<SubstitutableVar, string>>
): string {
  for (const key of Object.keys(vars)) {
    str = str.replaceAll(`{${key}}`, vars[key as SubstitutableVar]);
  }
  return str;
}

export function getUnsubstitutedVars(str: string): Set<SubstitutableVar> {
  const unsubstituted = new Set<SubstitutableVar>();

  for (const templateVar of ALL_SUBSTITUTABLE_VARS) {
    if (str.includes(`{${templateVar}}`)) {
      unsubstituted.add(templateVar);
    }
  }

  return unsubstituted;
}
