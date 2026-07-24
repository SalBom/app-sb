// src/store/tourStore.tsx
// Estado global del tour guiado ("cómo cargar un pedido"). Además de
// abrir/cerrar y avanzar de paso, guarda el rectángulo (en coordenadas de
// ventana) del elemento real que hay que resaltar en cada paso — lo llenan los
// propios componentes (sidebar, tarjeta de producto, carrito) vía
// useTourTarget cuando les toca ser el paso activo.
import { create } from 'zustand';

export type TourStepId = 'agregar-producto' | 'ir-carrito' | 'cliente' | 'plazo' | 'confirmar';

export type TourRect = { x: number; y: number; width: number; height: number };

export const TOUR_STEPS: { id: TourStepId; text: string }[] = [
  { id: 'agregar-producto', text: 'Elegí un producto y tocá "Agregar al carrito". Podés repetirlo con todos los que necesites.' },
  { id: 'ir-carrito', text: 'Cuando termines, tocá acá para ir al Carrito.' },
  { id: 'cliente', text: 'Elegí el cliente para el que es este pedido.' },
  { id: 'plazo', text: 'Elegí el plazo de pago.' },
  { id: 'confirmar', text: 'Revisá el pedido y tocá "Continuar" para confirmarlo.' },
];

type TourState = {
  active: boolean;
  stepIndex: number;
  rects: Partial<Record<TourStepId, TourRect>>;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  setRect: (id: TourStepId, rect: TourRect | null) => void;
};

export const useTourStore = create<TourState>((set) => ({
  active: false,
  stepIndex: 0,
  rects: {},

  start: () => set({ active: true, stepIndex: 0, rects: {} }),
  stop: () => set({ active: false, rects: {} }),

  next: () =>
    set((s) => {
      const stepIndex = Math.min(s.stepIndex + 1, TOUR_STEPS.length - 1);
      // Al pasar de paso limpiamos el rect del paso anterior: si es de otra
      // pantalla puede quedar obsoleto (ej. el carrito todavía no se montó).
      return { stepIndex };
    }),
  prev: () => set((s) => ({ stepIndex: Math.max(s.stepIndex - 1, 0) })),

  setRect: (id, rect) =>
    set((s) => ({ rects: { ...s.rects, [id]: rect ?? undefined } })),
}));
