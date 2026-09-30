// src/store/totemPromoStore.ts
// Visibilidad del cartel con los dos QR (ser distribuidor / lista de precios).
// Lo prende un reloj cada tantos minutos y lo apaga el visitante al tocar, o
// solo, pasados unos segundos.
import { create } from 'zustand';

type Estado = {
  visible: boolean;
  mostrar: () => void;
  ocultar: () => void;
};

export const useTotemPromoStore = create<Estado>((set) => ({
  visible: false,
  mostrar: () => set({ visible: true }),
  ocultar: () => set({ visible: false }),
}));
