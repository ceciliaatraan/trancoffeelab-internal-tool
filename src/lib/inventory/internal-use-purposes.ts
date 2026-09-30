/** Vad ett eget uttag ur lagret användes till - sparas som text först i lagerrörelsens note. */
export const INTERNAL_USE_PURPOSES = {
  own_use: "Eget bruk",
  marketing: "Marknadsföring",
  event: "Event",
  other: "Annat",
} as const;

export type InternalUsePurpose = keyof typeof INTERNAL_USE_PURPOSES;
