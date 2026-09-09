"use client";

import { useState } from "react";

const inputClass =
  "w-full border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";
const labelClass = "tran-label mb-1 block text-[11px] text-tran-muted";

/**
 * The discount's "value" field means different units depending on "type"
 * (percent off, or a fixed kronor amount) — see discountInputSchema. This
 * keeps the unit label in sync with whichever type is currently selected,
 * so "Värde" never shows the wrong unit.
 */
export function DiscountValueField({
  defaultType = "percentage",
  defaultValue,
}: {
  defaultType?: "percentage" | "fixed";
  defaultValue?: string;
}) {
  const [type, setType] = useState<"percentage" | "fixed">(defaultType);

  return (
    <>
      <div>
        <label className={labelClass}>Typ</label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as "percentage" | "fixed")}
          className={inputClass}
        >
          <option value="percentage">Procent</option>
          <option value="fixed">Fast belopp</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Värde ({type === "percentage" ? "%" : "kr"})</label>
        <input
          name="value"
          type="number"
          min={0.01}
          max={type === "percentage" ? 100 : undefined}
          step="0.01"
          defaultValue={defaultValue}
          required
          className={inputClass}
        />
      </div>
    </>
  );
}
