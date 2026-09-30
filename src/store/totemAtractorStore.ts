// src/store/totemAtractorStore.ts
// Visibilidad de la pantalla de atracción del tótem. La prende el reloj de
// inactividad (useTotemIdle) y la apaga el primer toque del visitante.
import { create } from 'zustand';

type Estado = {
  visible: boolean;
  mostrar: () => void;
  ocultar: () => void;
};

export const useTotemAtractorStore = create<Estado>((set) => ({
  visible: false,
  mostrar: () => set({ visible: true }),
  ocultar: () => set({ visible: false }),
}));
