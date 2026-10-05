import Image from "next/image";
import marca from "../../brand/plexu-mark.svg";
import logoClaro from "../../brand/plexu-logo-light.svg";
import logoEscuro from "../../brand/plexu-logo-dark.svg";

/** Só o símbolo (sidebar recolhida, telas de entrada). */
export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  return <Image src={marca} alt="Plexu" width={tamanho} height={tamanho} priority />;
}

/** Logo completo, um arquivo por tema (docs/DESIGN.md): claro no tema claro, escuro no escuro. */
export function Logo({ altura = 28 }: { altura?: number }) {
  const largura = Math.round((altura * 640) / 200);
  return (
    <>
      <Image src={logoClaro} alt="Plexu" width={largura} height={altura} priority className="dark:hidden" />
      <Image src={logoEscuro} alt="Plexu" width={largura} height={altura} priority className="hidden dark:block" />
    </>
  );
}
