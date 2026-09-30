/** Orsaker till en reklamation - sparas som text först i lagerrörelsens note. */
export const CLAIM_CAUSES = {
  broken: "Trasig vara",
  wrong_item: "Fel vara",
  missing: "Saknades i paketet",
  other: "Annat",
} as const;

export type ClaimCause = keyof typeof CLAIM_CAUSES;

/** Prefix som alla reklamationers anteckningar börjar med. */
export const CLAIM_NOTE_PREFIX = "Reklamation";
