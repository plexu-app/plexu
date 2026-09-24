import Image from "next/image";
import marca from "../../brand/plexu-mark.svg";

export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  return <Image src={marca} alt="Plexu" width={tamanho} height={tamanho} priority />;
}
