// Versión web: remueve el fondo de una foto de producto 100% en el navegador
// usando @imgly/background-removal (WASM, sin API key, sin costo por imagen).
// El resultado se cachea en memoria por URL para no reprocesar la misma foto
// dos veces durante la sesión.
//
// ⚠️ IMPORTANTE: NO importamos @imgly de forma estática. Esa librería arrastra
// `onnxruntime-web`, cuyo `ort.bundle.min.mjs` usa un `import(/*webpackIgnore*/)`
// que Metro (el bundler de Expo Web) no puede parsear y rompe `expo export`.
// Por eso la cargamos desde un CDN en RUNTIME (import nativo del navegador),
// construyendo el import con `new Function` para que Metro no lo analice ni lo
// intente empaquetar. Si algo falla, devolvemos la imagen original.

const cache = new Map<string, Promise<string>>();

const IMGLY_CDN = 'https://esm.sh/@imgly/background-removal@1.7.0';

// Import nativo del navegador, invisible para el análisis estático de Metro.
const runtimeImport: (u: string) => Promise<any> =
  // eslint-disable-next-line no-new-func
  new Function('u', 'return import(u)') as any;

export async function removeBackground(uri: string): Promise<string> {
  if (!uri) return uri;

  const cached = cache.get(uri);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const mod = await runtimeImport(IMGLY_CDN);
      const imglyRemoveBackground = mod.removeBackground || mod.default?.removeBackground;
      if (typeof imglyRemoveBackground !== 'function') return uri;
      const blob = await imglyRemoveBackground(uri);
      return URL.createObjectURL(blob);
    } catch (e) {
      // Si falla (ej. CORS de la foto, red, modelo no descargó a tiempo),
      // devolvemos la original para no romper el hero.
      return uri;
    }
  })();

  cache.set(uri, promise);
  return promise;
}
