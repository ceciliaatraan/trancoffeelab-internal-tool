/**
 * Riktig logotypfil, mottagen från er (samma fil används redan på
 * trancoffeelab.com — se trancoffeelab-website/src/assets/tran-logo.webp).
 * Rastergrafik, inte vektor-SVG — den här sandboxen har ingen
 * bildspårningsverktyg (potrace/imagemagick m.fl. är blockerade av
 * nätverkspolicyn) för att göra en riktig SVG-spårning. Om ni har
 * originalfilen som vektor (AI/EPS/SVG) hör av er, annars fungerar den
 * här rasterversionen fint i alla nuvarande användningar (fast höjd,
 * `w-auto`).
 */
export function TranWordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fast lokal /public-tillgång, inget behov av Next/Image här
    <img
      src="/logo/tran-wordmark.webp"
      alt="TRAN"
      width={1600}
      height={645}
      className={className}
    />
  );
}
