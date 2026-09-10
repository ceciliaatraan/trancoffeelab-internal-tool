import { Spinner } from "@/components/spinner";

/**
 * Next.js visar den här automatiskt (via Suspense) som innehåll i
 * <main>-ytan i layout.tsx medan en admin-sida navigeras till och dess
 * data hämtas server-side - sidopanel/topbar ligger kvar orörda. En enda
 * delad loading.tsx här täcker alla /*-rutter under (admin) som inte har
 * en egen, mer specifik loading.tsx.
 */
export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-6 w-6 text-tran-black" />
      <span className="sr-only">Laddar...</span>
    </div>
  );
}
