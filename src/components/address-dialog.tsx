"use client";

import { useRef } from "react";
import { SubmitButton } from "./submit-button";

type Address = Partial<Record<string, string>>;

type AddressDialogProps = {
  title: string;
  address: Address | null;
  action: (formData: FormData) => void | Promise<void>;
  /** Visas i modalen - t.ex. påminnelse om att rätta fraktsedeln hos PostNord. */
  hint?: string;
};

const fieldClass =
  "w-full border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";

function Field({
  name,
  label,
  defaultValue,
  required = false,
  className = "",
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  maxLength?: number;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="tran-label text-[11px] text-tran-muted">
        {label}
        {required ? "" : " (valfritt)"}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        className={fieldClass}
      />
    </label>
  );
}

/**
 * Modal för att rätta en adress på en order - nativ <dialog> precis som
 * ClaimDialog. Sparas av updateOrderAddressAction.
 */
export function AddressDialog({ title, address, action, hint }: AddressDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const value = (field: string) => address?.[field];

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="tran-label mt-2 text-[11px] text-tran-muted underline underline-offset-2 hover:text-tran-red"
      >
        Ändra
      </button>

      <dialog
        ref={dialogRef}
        aria-label={title}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] border border-tran-black bg-tran-white p-0 backdrop:bg-black/40"
      >
        <form action={action} className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold uppercase tracking-tight">{title}</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Stäng"
              className="text-xl leading-none text-tran-muted hover:text-tran-red"
            >
              ×
            </button>
          </div>
          {hint ? <p className="text-xs text-tran-muted">{hint}</p> : null}

          <div className="grid grid-cols-2 gap-3">
            <Field name="given_name" label="Förnamn" defaultValue={value("given_name")} required />
            <Field name="family_name" label="Efternamn" defaultValue={value("family_name")} required />
            <Field
              name="organization_name"
              label="Företag"
              defaultValue={value("organization_name")}
              className="col-span-2"
            />
            <Field
              name="street_address"
              label="Gatuadress"
              defaultValue={value("street_address")}
              required
              className="col-span-2"
            />
            <Field
              name="street_address2"
              label="Adressrad 2 (c/o, lgh)"
              defaultValue={value("street_address2")}
              className="col-span-2"
            />
            <Field name="postal_code" label="Postnummer" defaultValue={value("postal_code")} required />
            <Field name="city" label="Ort" defaultValue={value("city")} required />
            <Field
              name="country"
              label="Land (landskod)"
              defaultValue={(value("country") ?? "se").toUpperCase()}
              required
              maxLength={2}
            />
            <Field name="phone" label="Telefon" defaultValue={value("phone")} />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="tran-label border border-tran-hairline px-3 py-1.5 text-xs text-tran-muted hover:border-tran-black hover:text-tran-black"
            >
              Avbryt
            </button>
            <SubmitButton className="tran-label border border-tran-black bg-tran-black px-3 py-1.5 text-xs text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red">
              Spara adress
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
