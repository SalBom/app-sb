// src/config/escalasPrecio.ts
// Escalas de precio por cantidad de la tarifa de Odoo (ej. x10, x50, x100).
// El precio unitario depende de CUÁNTAS unidades se piden, así que no alcanza
// con guardarlo una vez: hay que recalcularlo cada vez que cambia la cantidad.

export type EscalaPrecio = { min_qty: number; price: number };

/**
 * Precio unitario que corresponde a `cantidad` unidades.
 * Toma la escala más conveniente entre las que ya alcanzó.
 * Si todavía no llega a ninguna, devuelve `precioBase`.
 */
export function precioSegunCantidad(
  escalas: EscalaPrecio[] | null | undefined,
  cantidad: number,
  precioBase: number
): number {
  if (!Array.isArray(escalas) || escalas.length === 0) return precioBase;
  const qty = Number(cantidad) || 0;

  let mejor: number | null = null;
  for (const e of escalas) {
    const min = Number(e?.min_qty) || 0;
    const precio = Number(e?.price);
    if (!precio || precio <= 0) continue;
    // Sólo cuentan las escalas cuyo mínimo ya se alcanzó. Entre esas, la más barata.
    if (qty >= min && (mejor === null || precio < mejor)) mejor = precio;
  }
  return mejor !== null ? mejor : precioBase;
}

/** Escala vigente para esa cantidad (para resaltarla en pantalla). */
export function escalaVigente(
  escalas: EscalaPrecio[] | null | undefined,
  cantidad: number
): EscalaPrecio | null {
  if (!Array.isArray(escalas) || escalas.length === 0) return null;
  const qty = Number(cantidad) || 0;
  const alcanzadas = escalas.filter(e => qty >= (Number(e?.min_qty) || 0));
  if (alcanzadas.length === 0) return null;
  return alcanzadas.reduce((a, b) => (b.price < a.price ? b : a));
}
