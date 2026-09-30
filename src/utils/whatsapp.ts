// src/utils/whatsapp.ts
// Contacto por WhatsApp para el modo invitado (institucional). El número es el
// oficial de ventas de Sal-Bom. Se abre wa.me con un mensaje pre-armado que
// menciona el producto que estaba viendo el visitante.
import { Linking } from 'react-native';
import { esTotem } from '../config/totem';
import { useTotemContactoStore } from '../store/totemContactoStore';

// +54 9 11 3796-9970 → formato internacional sin símbolos para wa.me
export const SALBOM_WHATSAPP = '5491137969970';

export function mensajeWhatsApp(producto?: { name?: string | null; default_code?: string | null } | null) {
  const nombre = producto?.name ? String(producto.name) : '';
  const ref = producto?.default_code ? ` (${producto.default_code})` : '';
  return nombre
    ? `Hola, estoy interesado en este producto: ${nombre}${ref}`
    : 'Hola, estoy interesado en un producto del catálogo.';
}

export function contactarPorWhatsApp(producto?: { name?: string | null; default_code?: string | null }) {
  // En el tótem de la expo no abrimos WhatsApp: dejaría el kiosko abierto en
  // otra aplicación y nadie lo volvería a la web. Mostramos un QR para que el
  // visitante siga la conversación en su propio celular.
  if (esTotem()) {
    useTotemContactoStore.getState().abrir(producto || null);
    return;
  }
  const url = `https://wa.me/${SALBOM_WHATSAPP}?text=${encodeURIComponent(mensajeWhatsApp(producto))}`;
  Linking.openURL(url).catch(() => {});
}
