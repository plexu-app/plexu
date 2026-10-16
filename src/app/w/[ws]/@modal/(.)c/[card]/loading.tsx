// Enquanto o card carrega: o véu e a moldura do modal aparecem na hora do clique.
export default function CarregandoCard() {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-veu" aria-hidden />
      <div className="fixed inset-2 z-50 mx-auto max-w-[1440px] overflow-hidden rounded-xl bg-paper" role="status" aria-label="Carregando card" data-carregando-card>
        <div className="grid h-full grid-cols-[minmax(0,564px)_minmax(0,564px)_276px] pl-8">
          <div className="flex flex-col gap-3 py-6 pr-6">
            <div className="h-7 w-2/3 animate-pulse rounded bg-bg" />
            <div className="h-6 w-80 animate-pulse rounded-full bg-bg" />
            <div className="mt-6 h-24 animate-pulse rounded bg-bg" />
          </div>
          <div className="flex flex-col gap-3 border-l border-line p-6">
            <div className="h-6 w-40 animate-pulse rounded bg-bg" />
            <div className="h-10 animate-pulse rounded bg-bg" />
            <div className="h-10 animate-pulse rounded bg-bg" />
          </div>
          <div className="border-l border-line" />
        </div>
      </div>
    </>
  );
}
