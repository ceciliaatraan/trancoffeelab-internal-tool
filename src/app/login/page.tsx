import { signIn } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const hasError = "error" in params;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-24">
      <TranWordmark className="h-16 w-auto" />
      <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
        <p className="tran-label text-xs text-tran-muted">Backoffice</p>
        {hasError ? (
          <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">
            Inloggningen nekades. Kontrollera att du använder rätt
            Google-konto.
          </p>
        ) : null}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="w-full border border-tran-black bg-tran-black px-6 py-3 text-sm font-medium text-tran-white transition-colors hover:bg-tran-red hover:border-tran-red"
          >
            Logga in med Google
          </button>
        </form>
      </div>
    </div>
  );
}
