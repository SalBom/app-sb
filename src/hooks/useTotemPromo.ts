// src/hooks/useTotemPromo.ts
// Reloj del cartel de los dos QR en el tótem: lo muestra cada tantos minutos
// mientras alguien está usando la pantalla y lo cierra solo a los pocos
// segundos (o antes, si el visitante toca).
//
// Cuidados para no molestar:
//  - no aparece si está la pantalla de atracción (nadie está usando el tótem)
//    ni encima del QR de consulta de un producto: en ese caso espera un rato
//    y vuelve a intentar;
//  - cualquier toque lo cierra y reinicia la cuenta desde cero.
import { useEffect } from 'react';
import { esTotem, TOTEM_PROMO_CADA_MS } from '../config/totem';
import { useTotemPromoStore } from '../store/totemPromoStore';
import { useTotemAtractorStore } from '../store/totemAtractorStore';
import { useTotemContactoStore } from '../store/totemContactoStore';

export default function useTotemPromo() {
  useEffect(() => {
    if (!esTotem() || typeof window === 'undefined') return;

    let mostrarTimer: any;

    const programar = (espera = TOTEM_PROMO_CADA_MS) => {
      clearTimeout(mostrarTimer);
      mostrarTimer = setTimeout(aparecer, espera);
    };

    const aparecer = () => {
      const ocupado =
        useTotemAtractorStore.getState().visible || useTotemContactoStore.getState().visible;
      if (ocupado) {
        programar(30 * 1000); // reintenta en un rato, sin pisar lo que hay en pantalla
        return;
      }
      // El cartel se cierra solo (ver TotemPromoQR); acá solo programamos el próximo.
      useTotemPromoStore.getState().mostrar();
      programar();
    };

    // Un toque cierra el cartel y reinicia la cuenta: así el visitante que está
    // navegando no se lo encuentra dos veces seguidas.
    const alTocar = () => {
      if (useTotemPromoStore.getState().visible) useTotemPromoStore.getState().ocultar();
      programar();
    };

    const eventos = ['pointerdown', 'touchstart', 'keydown'];
    eventos.forEach((e) => window.addEventListener(e, alTocar, { passive: true }));
    programar();

    return () => {
      clearTimeout(mostrarTimer);
      eventos.forEach((e) => window.removeEventListener(e, alTocar));
    };
  }, []);
}
