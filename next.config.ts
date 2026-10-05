import type { NextConfig } from "next";
// Indicador do next dev à direita: no canto esquerdo ele cobre o rodapé da sidebar (tema, sair).
const nextConfig: NextConfig = { output: "standalone", devIndicators: { position: "bottom-right" } };
export default nextConfig;
