// src/hooks/useTotemIdle.ts
// En el tótem de la expo, cuando alguien se va en medio de una búsqueda la
// pantalla queda como la dejó. Esto la devuelve sola al inicio después de un
// rato sin que nadie la toque, para que el próximo visitante la encuentre
// "limpia". Solo corre en modo tótem.
import { useEffect } from 'react';
import { esTotem, TOTEM_INACTIVIDAD_MS, TOTEM_CIERRE_SESION_MS } from '../config/totem';
import { navigationRef } from '../../App';
import { useTotemPromoStore } from '../store/totemPromoStore';
import { useGuestStore } from '../store/guestStore';
import { useCartStore } from '../store/cartStore';
import { clearAuth } from '../utils/authStorage';

export default function useTotemIdle() {
  useEffect(() => {
    if (!esTotem() || typeof window === 'undefined') return;

    let timer: any;
    let timerSesion: any;

    const enReposo = () => {
      // Vuelve al inicio y muestra los QR: el próximo visitante encuentra la
      // pantalla limpia y, de paso, los códigos para llevarse el contacto y la
      // lista de precios.
      try {
        if (navigationRef.isReady()) {
          (navigationRef.navigate as any)('MainTabs', { screen: 'Home' });
        }
        window.scrollTo({ top: 0 });
      } catch {}
      useTotemPromoStore.getState().mostrar();
    };

    // Red de seguridad: si quedó una sesión abierta y nadie usa el tótem, se
    // cierra sola. Así el próximo visitante no entra con la cuenta de otro.
    const cerrarSesionSiQuedoAbierta = () => {
      if (useGuestStore.getState().isGuest) return;
      clearAuth();
      useCartStore.getState().clearCart();
      useGuestStore.getState().enterGuest();
    };

    const reiniciar = () => {
      clearTimeout(timer);
      clearTimeout(timerSesion);
      timer = setTimeout(enReposo, TOTEM_INACTIVIDAD_MS);
      timerSesion = setTimeout(cerrarSesionSiQuedoAbierta, TOTEM_CIERRE_SESION_MS);
    };

    const eventos = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();

    return () => {
      clearTimeout(timer);
      clearTimeout(timerSesion);
      eventos.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, []);
}
