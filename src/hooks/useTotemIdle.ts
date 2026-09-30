// src/hooks/useTotemIdle.ts
// En el tótem de la expo, cuando alguien se va en medio de una búsqueda la
// pantalla queda como la dejó. Esto la devuelve sola al inicio después de un
// rato sin que nadie la toque, para que el próximo visitante la encuentre
// "limpia". Solo corre en modo tótem.
import { useEffect } from 'react';
import { esTotem, TOTEM_INACTIVIDAD_MS } from '../config/totem';
import { navigationRef } from '../../App';
import { useTotemAtractorStore } from '../store/totemAtractorStore';

export default function useTotemIdle() {
  useEffect(() => {
    if (!esTotem() || typeof window === 'undefined') return;

    let timer: any;

    const enReposo = () => {
      // Vuelve al inicio Y muestra la pantalla de atracción: el próximo visitante
      // encuentra una invitación a tocar, no la búsqueda del anterior.
      try {
        if (navigationRef.isReady()) {
          (navigationRef.navigate as any)('MainTabs', { screen: 'Home' });
        }
        window.scrollTo({ top: 0 });
      } catch {}
      useTotemAtractorStore.getState().mostrar();
    };

    const reiniciar = () => {
      clearTimeout(timer);
      timer = setTimeout(enReposo, TOTEM_INACTIVIDAD_MS);
    };

    const eventos = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();

    return () => {
      clearTimeout(timer);
      eventos.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, []);
}
