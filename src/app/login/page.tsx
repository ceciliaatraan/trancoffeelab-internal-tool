import { signIn } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";
import { SubmitButton } from "@/components/submit-button";

/**
 * Inloggningen i samma formspråk som trancoffeelab.com: ett rutnät med
 * tunna svarta linjer som fyller skärmen, med inloggningen i en ruta i
 * mitten. Dator: 4×4 rutor, inloggningen i de fyra i mitten och 12 rutor
 * runt omkring. Telefon: smalare kantkolumner och -rader (1fr 3fr 1fr) så
 * inloggningen får plats i mitten med 14 rutor runt omkring.
 */
const CELL_COUNT = 14;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const hasError = "error" in params;

  return (
    <div className="grid h-dvh min-h-[560px] w-full grid-cols-[1fr_3fr_1fr] grid-rows-[1fr_1fr_2.6fr_1fr_1fr] border-l border-t border-tran-black lg:grid-cols-4 lg:grid-rows-4">
      <section className="col-start-2 row-start-3 flex min-w-0 flex-col items-center justify-center gap-6 border-b border-r border-tran-black px-4 lg:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:gap-10 lg:px-6">
        <TranWordmark className="h-10 w-auto lg:h-20" />
        <div className="flex w-full max-w-xs flex-col items-center gap-4 text-center lg:gap-6">
          <p className="tran-label text-xs text-tran-muted">Backoffice</p>
          {hasError ? (
            <p className="border border-tran-red px-3 py-2 text-xs text-tran-red lg:px-4 lg:py-3 lg:text-sm">
              Inloggningen nekades. Kontrollera att du använder rätt Google-konto.
            </p>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="w-full"
          >
            <SubmitButton className="w-full border border-tran-black bg-tran-black px-4 py-3 text-sm font-medium text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red">
              Logga in med Google
            </SubmitButton>
          </form>
        </div>
      </section>

      {/* Rutnätets övriga rutor - 14 på telefon, de två sista döljs på dator (12). */}
      {Array.from({ length: CELL_COUNT }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`border-b border-r border-tran-black ${index >= 12 ? "lg:hidden" : ""}`}
        />
      ))}
    </div>
  );
}
