// src/config/totem.ts
// MODO TÓTEM — pantalla táctil vertical de 32" (1080 x 1920) para exposiciones.
//
// Se enciende abriendo la web con ?totem=1 y queda guardado en ese navegador,
// así el kiosko puede arrancar en cualquier URL del sitio. Para apagarlo,
// abrir la web con ?totem=0.
//
// Qué cambia (todo solo en web, la APK no se entera):
//  - se fuerza el diseño de escritorio aunque la pantalla sea angosta;
//  - se agranda todo un poco para que se lea y se toque bien de parado;
//  - se entra siempre como invitado: sin login, sin carrito, sin precios de oferta;
//  - se saca lo que no va en una pantalla pública (botón Ingresar, tipo de cambio);
//  - no se puede seleccionar texto, ni abrir el menú del clic derecho, ni ver
//    la flecha del mouse, ni arrastrar imágenes;
//  - tras un rato sin uso, vuelve solo a la pantalla de inicio.
import { Platform } from 'react-native';

const CLAVE = 'totem_mode';

// Ancho con el que está diseñada la versión de escritorio. En el tótem se
// dibuja la página a este ancho y después se escala a la pantalla real, así se
// ve idéntica a la web de escritorio (sin títulos cortados ni columnas fuera de
// cuadro) pero ocupando los 1080 px verticales del tótem.
const ANCHO_DISENO = 1280;

// Tiempo sin tocar la pantalla antes de volver solo al inicio.
export const TOTEM_INACTIVIDAD_MS = 90 * 1000;

let activo = false;

/** Lee el flag (?totem=1 o lo guardado) y aplica los estilos de kiosko. Se llama una sola vez al arrancar. */
export function initTotem(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const param = new URLSearchParams(window.location.search).get('totem');
  try {
    if (param === '1' || param === 'true') window.localStorage.setItem(CLAVE, '1');
    else if (param === '0' || param === 'false') window.localStorage.removeItem(CLAVE);
    activo = window.localStorage.getItem(CLAVE) === '1';
  } catch {
    activo = param === '1' || param === 'true'; // navegador sin storage: vale solo la URL
  }

  if (activo) aplicarEstilos();
  return activo;
}

/** true si esta pantalla es el tótem. */
export function esTotem(): boolean {
  return activo;
}

function aplicarEstilos() {
  if (typeof document === 'undefined' || document.getElementById('totem-css')) return;

  const css = `
    /* La página se arma con el ancho de escritorio y se escala (ver escalar()). */
    #root { width: ${ANCHO_DISENO}px; }
    html, body { overflow-x: hidden; }

    /* Nada de selección de texto, menú del clic derecho ni arrastrar imágenes:
       en una pantalla táctil pública solo generan estados raros. */
    * { -webkit-user-select: none; user-select: none;
        -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
    input, textarea { -webkit-user-select: text; user-select: text; }
    img { -webkit-user-drag: none; }

    /* Sin flecha del mouse (es táctil) y sin rebote al llegar al final. */
    html, body { cursor: none; overscroll-behavior: none; }

    /* Barras de scroll ocultas: se desplaza con el dedo. */
    ::-webkit-scrollbar { width: 0; height: 0; }
  `;
  const style = document.createElement('style');
  style.id = 'totem-css';
  style.textContent = css;
  document.head.appendChild(style);

  escalar();
  window.addEventListener('resize', () => escalar());

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // Doble toque = zoom en Chrome; en un kiosko deja la pantalla torcida.
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

/**
 * Escala la página para que el ancho de diseño entre justo en la pantalla del tótem.
 * Al arrancar, #root todavía no existe (React no montó), así que reintenta un rato.
 */
function escalar(intentos = 40) {
  const root = document.getElementById('root');
  if (!root) {
    if (intentos > 0) setTimeout(() => escalar(intentos - 1), 50);
    return;
  }
  // A 1080 px de ancho queda en 0,84; si el tótem estuviera en 4K (2160), en 1,7.
  (root.style as any).zoom = String(window.innerWidth / ANCHO_DISENO);
}
