// src/hooks/useTourTarget.ts
// Engancha un elemento real de la UI como el "objetivo" de un paso del tour
// guiado: cuando ese paso está activo, mide su posición en pantalla y la
// publica en tourStore para que TourOverlay dibuje el spotlight ahí. Se usa
// con `ref={useTourTarget('cliente')}` en el elemento a resaltar.
import { useEffect, useRef } from 'react';
import { useTourStore, TOUR_STEPS, TourStepId } from '../store/tourStore';

export function useTourTarget(stepId: TourStepId) {
  const ref = useRef<any>(null);
  const active = useTourStore((s) => s.active);
  const currentStepId = useTourStore((s) => TOUR_STEPS[s.stepIndex]?.id);
  const setRect = useTourStore((s) => s.setRect);
  const isCurrent = active && currentStepId === stepId;

  useEffect(() => {
    if (!isCurrent) return;

    const measure = () => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return;
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if (width > 0 && height > 0) setRect(stepId, { x, y, width, height });
      });
    };

    // Se mide en el próximo frame y de nuevo un poco después: el paso puede
    // haber cambiado justo cuando la pantalla destino recién se está montando
    // o el sidebar recién terminó de animarse, así que una sola medición
    // inmediata a veces llega antes de que el layout final esté listo.
    const raf = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); setRect(stepId, null); };
  }, [isCurrent, stepId, setRect]);

  return ref;
}
