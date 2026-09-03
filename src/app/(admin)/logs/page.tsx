import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDateTime } from "@/lib/format";

export default async function LogsPage() {
  const [webhookEvents, auditLogEntries] = await Promise.all([
    db.select().from(schema.webhookEvents).orderBy(desc(schema.webhookEvents.receivedAt)).limit(50),
    db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(50),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-4xl">Loggar</h1>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Webhook-anrop från Kustom</h2>
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
              </tr>
            </thead>
            <tbody>
              {webhookEvents.map((event) => (
                <tr key={event.id} className="border-b border-tran-hairline">
                  <td className="py-2 pr-4">{event.source}</td>
                  <td className="tran-tabular py-2 pr-4 text-tran-muted">
                    {event.kustomOrderId ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {event.processed ? (
                      "Ja"
                    ) : (
                      <span className="text-tran-red">Nej</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-tran-red">{event.errorMessage ?? ""}</td>
                  <td className="tran-tabular py-2 pr-4 text-tran-muted">
                    {formatDateTime(event.receivedAt)}
                  </td>
                </tr>
              ))}
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
                  <td className="py-2 pr-4 text-tran-muted">{entry.actorEmail ?? "—"}</td>
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
