"use client";

/**
 * Rullgardin med position 1…total som skickar sitt formulär direkt när man
 * väljer - för att ändra ordningen på t.ex. försäljningsställen.
 */
export function PositionSelect({
  action,
  current,
  total,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  current: number;
  total: number;
  label: string;
}) {
  return (
    <form action={action}>
      <select
        name="position"
        defaultValue={current}
        aria-label={label}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="tran-tabular h-9 border border-tran-black bg-tran-white px-2 text-sm"
      >
        {Array.from({ length: total }, (_, index) => (
          <option key={index + 1} value={index + 1}>
            {index + 1}
          </option>
        ))}
      </select>
    </form>
  );
}
