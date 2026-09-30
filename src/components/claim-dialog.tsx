"use client";

import { useRef } from "react";
import { SubmitButton } from "./submit-button";

type ClaimDialogProps = {
  orderNumber: number;
  action: (formData: FormData) => void | Promise<void>;
  options: { inventoryId: string; label: string; inOrder: boolean }[];
  causes: Record<string, string>;
};

const fieldClass =
  "w-full border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";

/**
 * Modal för att registrera en reklamation (ersättningsvara till kunden) -
 * nativ <dialog> (showModal) för fokusfångst, Esc och bakgrundsspärr utan
 * eget modal-bibliotek. Själva sparandet är en server action
 * (registerClaimAction), som redirectar tillbaka till ordern.
 */
export function ClaimDialog({ orderNumber, action, options, causes }: ClaimDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inOrder = options.filter((option) => option.inOrder);
  const others = options.filter((option) => !option.inOrder);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="tran-label self-start border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
      >
        Registrera reklamation
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="claim-dialog-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] border border-tran-black bg-tran-white p-0 backdrop:bg-black/40"
      >
        <form action={action} className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="claim-dialog-title" className="text-xl font-bold uppercase tracking-tight">
              Reklamation - order #{orderNumber}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Stäng"
              className="text-xl leading-none text-tran-muted hover:text-tran-red"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-tran-muted">
            För en ersättningsvara ni skickar till kunden utan kostnad, t.ex. ett nytt phin-filter
            när det första var trasigt. Varan dras från lagret och reklamationen sparas på ordern.
            Betalningen påverkas inte.
          </p>

          <label className="flex flex-col gap-1">
            <span className="tran-label text-[11px] text-tran-muted">Ersättningsvara</span>
            <select name="inventoryId" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Välj vara…
              </option>
              {inOrder.length > 0 ? (
                <optgroup label="I den här ordern">
                  {inOrder.map((option) => (
                    <option key={option.inventoryId} value={option.inventoryId}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label={inOrder.length > 0 ? "Övriga varor" : "Varor"}>
                {others.map((option) => (
                  <option key={option.inventoryId} value={option.inventoryId}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="tran-label text-[11px] text-tran-muted">Antal</span>
              <input name="quantity" type="number" min={1} defaultValue={1} required className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tran-label text-[11px] text-tran-muted">Orsak</span>
              <select name="cause" required defaultValue="broken" className={fieldClass}>
                {Object.entries(causes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="tran-label text-[11px] text-tran-muted">Kommentar - varför?</span>
            <textarea
              name="comment"
              required
              rows={3}
              placeholder="T.ex. phin-filtret kom fram med trasigt lock, kunden skickade bild."
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="tran-label text-[11px] text-tran-muted">
              Spårningsnummer för ersättningen (valfritt)
            </span>
            <input name="trackingNumber" className={fieldClass} />
          </label>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="tran-label border border-tran-hairline px-3 py-1.5 text-xs text-tran-muted hover:border-tran-black hover:text-tran-black"
            >
              Avbryt
            </button>
            <SubmitButton className="tran-label border border-tran-black bg-tran-black px-3 py-1.5 text-xs text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red">
              Registrera reklamation
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
