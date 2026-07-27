// src/config/masterbox.ts
// Productos que se venden por "masterbox": la unidad de venta es una CAJA que
// contiene varios bultos/unidades. Cuando el vendedor agrega 1 caja, la app
// suma N unidades reales al carrito (lo que después va al pedido).
//
// La lista se administra desde el panel ADMIN (backend: /masterbox). Estos
// valores quedan como fallback por si la app arranca sin conexión al backend.
import { API_URL } from '../config';

const FALLBACK: Record<string, number> = {
  'IS-BJ2': 10,
  'IS-BJ4': 5,
  'IS-BJ6': 5,
  'IS-BJ8': 4,
  'IS-BJ10': 4,
  'IS-BJ12': 4,
  'IS-BJ16': 2,
  'IS-BJ20': 2,
  'IDB 35': 6,
};

// Mapa vigente en memoria (se pisa con lo que trae el backend al arrancar).
let MASTERBOX_UNITS: Record<string, number> = { ...FALLBACK };

const norm = (s?: string | null) => (s || '').trim().toUpperCase();

/** Unidades por masterbox si el producto se vende en caja; null si no. */
export function masterboxUnidades(sku?: string | null): number | null {
  const u = MASTERBOX_UNITS[norm(sku)];
  return u && u > 1 ? u : null;
}

/** Paso de cantidad para un SKU: N si es masterbox, 1 si no. */
export function masterboxStep(sku?: string | null): number {
  return masterboxUnidades(sku) || 1;
}

/**
 * Carga el mapa de masterbox desde el backend. Llamar una vez al arrancar la
 * app. Si falla, se mantienen los valores de FALLBACK (nunca deja la app sin
 * datos). No corta el arranque: falla en silencio.
 */
export async function cargarMasterbox(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/masterbox`);
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const limpio: Record<string, number> = {};
      for (const [k, v] of Object.entries(data)) {
        const n = Number(v);
        if (k && n > 1) limpio[norm(k)] = n;
      }
      if (Object.keys(limpio).length > 0) MASTERBOX_UNITS = limpio;
    }
  } catch {
    // sin conexión → queda el FALLBACK
  }
}
