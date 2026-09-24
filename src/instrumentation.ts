// Executado uma vez quando o servidor Next inicia (antes de atender requisições).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { verificarAmbiente } = await import("./instrumentation-node");
    verificarAmbiente();
  }
}
