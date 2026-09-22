import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDateTime } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { reprocessWebhookEventAction } from "./actions";

export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;
  const saved = "saved" in search;

  const [webhookEvents, auditLogEntries] = await Promise.all([
    db.select().from(schema.webhookEvents).orderBy(desc(schema.webhookEvents.receivedAt)).limit(50),
    db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(50),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Loggar</h1>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {saved ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">
          Ordern bearbetades om. Se raden längst upp för resultatet.
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Webhook-anrop från Kustom</h2>
        <p className="text-xs text-tran-muted">
          Ett misslyckat anrop (Nej i Bearbetad) betyder att ordern INTE sparades hos oss - ingen
          bekräftelse, inget lager reserverat - även om Kustom redan debiterat kunden. &quot;Bearbeta
          om&quot; försöker igen, ofarligt att klicka flera gånger.
        </p>
        {webhookEvents.length === 0 ? (
          <p className="text-sm text-tran-muted">Inga anrop än.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                <th className="py-2 pr-4 font-medium">Källa</th>
                <th className="py-2 pr-4 font-medium">Order-id</th>
                <th className="py-2 pr-4 font-medium">Bearbetad</th>
                <th className="py-2 pr-4 font-medium">Fel</th>
                <th className="py-2 pr-4 font-medium">Mottaget</th>
                <th className="py-2 pr-4 font-medium">Klar</th>
                <th className="py-2 pr-4 font-medium">Tid</th>
                <th className="py-2 pr-4 font-medium">Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {webhookEvents.map((event) => {
                const processingMs = event.processedAt
                  ? event.processedAt.getTime() - event.receivedAt.getTime()
                  : null;
                return (
                  <tr key={event.id} className="border-b border-tran-hairline">
                    <td className="py-2 pr-4">{event.source}</td>
                    <td className="tran-tabular py-2 pr-4 text-tran-muted">
                      {event.kustomOrderId ?? "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {event.processed ? (
                        "Ja"
                      ) : (
                        <span className="text-tran-red">Nej</span>
                      )}
                    </td>
                    <td className="max-w-xs py-2 pr-4 text-tran-red">
                      {event.errorMessage ? (
                        <details>
                          <summary className="block cursor-pointer truncate list-none marker:hidden [&::-webkit-details-marker]:hidden">
                            {event.errorMessage}
                          </summary>
                          <p className="mt-2 break-all whitespace-pre-wrap text-xs">
                            {event.errorMessage}
                          </p>
                        </details>
                      ) : null}
                    </td>
                    <td className="tran-tabular py-2 pr-4 text-tran-muted">
                      {formatDateTime(event.receivedAt)}
                    </td>
                    <td className="tran-tabular py-2 pr-4 text-tran-muted">
                      {event.processedAt ? formatDateTime(event.processedAt) : "-"}
                    </td>
                    <td className="tran-tabular py-2 pr-4 text-tran-muted">
                      {processingMs === null
                        ? "-"
                        : processingMs < 1000
                          ? `${processingMs} ms`
                          : `${(processingMs / 1000).toFixed(1)} s`}
                    </td>
                    <td className="py-2 pr-4">
                      {!event.processed && event.kustomOrderId ? (
                        <form action={reprocessWebhookEventAction.bind(null, event.id)}>
                          <SubmitButton className="tran-label border border-tran-black px-2 py-1 text-[11px] transition-colors hover:border-tran-red hover:text-tran-red">
                            Bearbeta om
                          </SubmitButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Inloggningsförsök och admin-åtgärder</h2>
        {auditLogEntries.length === 0 ? (
          <p className="text-sm text-tran-muted">Inga händelser än.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                <th className="py-2 pr-4 font-medium">Åtgärd</th>
                <th className="py-2 pr-4 font-medium">Vem</th>
                <th className="py-2 pr-4 font-medium">Resultat</th>
                <th className="py-2 pr-4 font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {auditLogEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-tran-hairline">
                  <td className="py-2 pr-4">{entry.action}</td>
                  <td className="py-2 pr-4 text-tran-muted">{entry.actorEmail ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {entry.success ? "OK" : <span className="text-tran-red">Nekad</span>}
                  </td>
                  <td className="tran-tabular py-2 pr-4 text-tran-muted">
                    {formatDateTime(entry.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
