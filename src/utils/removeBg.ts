// Versión nativa (iOS/Android): no-op. La remoción de fondo con IA en el
// navegador solo tiene sentido en web (usa WASM/Worker del browser), así que
// en mobile simplemente devolvemos la URL original sin procesar.
export async function removeBackground(uri: string): Promise<string> {
  return uri;
}
