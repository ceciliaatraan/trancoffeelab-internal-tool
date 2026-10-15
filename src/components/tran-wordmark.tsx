/**
 * TRAN-loggan - den nya, rundade versionen (samma fil som orderbekräftelsen
 * och kvittot använder, public/logo/tran-wordmark-email.png, och som
 * trancoffeelab.com visar i sidhuvudet sedan 2026-09-09). Rastergrafik
 * (PNG, 2000×710) - fungerar fint med fast höjd och `w-auto`.
 */
export function TranWordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fast lokal /public-tillgång, inget behov av Next/Image här
    <img src="/logo/tran-logo.png" alt="TRAN" width={2000} height={710} className={className} />
  );
}
