/**
 * PLACEHOLDER tills sajtens riktiga logotyp-SVG finns tillgänglig — se
 * "Avvikelser att bekräfta" i docs/branding.md. Sätts inline (inte som
 * <img src>) så SVG:n kan använda den redan inlästa Bulky-fonten via
 * @font-face i stället för en fallback.
 */
export function TranWordmark({
  className,
  color = "currentColor",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 64"
      role="img"
      aria-label="TRAN"
      className={className}
    >
      <text
        x="0"
        y="48"
        fontFamily="Bulky, ui-sans-serif, system-ui, sans-serif"
        fontSize="52"
        fill={color}
      >
        TRAN
        <tspan fontSize="20" dy="-28">
          ®
        </tspan>
      </text>
    </svg>
  );
}
