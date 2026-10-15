import { signIn } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";
import { SubmitButton } from "@/components/submit-button";
import { LOGIN_TILES } from "@/lib/login-tiles";

/**
 * Inloggningen i samma formspråk som trancoffeelab.com: ett rutnät med
 * tunna svarta linjer. På dator 4×4 rutor där inloggningen tar de fyra i
 * mitten och 12 designrutor ligger runt omkring; på mobil ligger
 * inloggningen överst och de 12 rutorna under, tre i bredd.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const hasError = "error" in params;

  return (
    <div className="grid min-h-screen w-full grid-cols-3 border-l border-t border-tran-black lg:h-screen lg:grid-cols-4 lg:grid-rows-4">
      <section className="col-span-3 flex flex-col items-center justify-center gap-10 border-b border-r border-tran-black px-6 py-16 lg:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:py-0">
        <TranWordmark className="h-16 w-auto lg:h-20" />
        <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
          <p className="tran-label text-xs text-tran-muted">Backoffice</p>
          {hasError ? (
            <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">
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
            <SubmitButton className="w-full border border-tran-black bg-tran-black px-6 py-3 text-sm font-medium text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red">
              Logga in med Google
            </SubmitButton>
          </form>
        </div>
      </section>

      {LOGIN_TILES.map((tile, index) => (
        <div
          key={index}
          className="relative aspect-square overflow-hidden border-b border-r border-tran-black bg-tran-white lg:aspect-auto"
        >
          {tile.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- lokala designbilder i /public/login, inget behov av Next/Image
            <img src={tile.src} alt={tile.alt} className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
