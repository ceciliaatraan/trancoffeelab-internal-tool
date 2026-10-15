/**
 * De 12 rutorna runt inloggningen (src/app/login/page.tsx) - era designs.
 * Lägg bilderna i public/login/ och skriv filnamnet här; en ruta utan bild
 * visas som en tom ruta i rutnätet. Ordningen är rutnätets läsordning:
 * rad för rad, uppifrån och ned, vänster till höger (på dator ligger
 * inloggningen i mitten och rutorna runt den).
 */
export const LOGIN_TILES: { src: string | null; alt: string }[] = Array.from({ length: 12 }, () => ({
  src: null,
  alt: "",
}));
