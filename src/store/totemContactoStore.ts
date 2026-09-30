// src/store/totemContactoStore.ts
// Estado del cartel de contacto del tótem (el QR de WhatsApp). Vive en un store
// global porque lo abren las tarjetas y la ficha de producto, pero el cartel se
// dibuja una sola vez, arriba de todo (ver App.tsx).
import { create } from 'zustand';

export type ProductoContacto = { name?: string | null; default_code?: string | null } | null;

type Estado = {
  visible: boolean;
  producto: ProductoContacto;
  abrir: (producto?: ProductoContacto) => void;
  cerrar: () => void;
};

export const useTotemContactoStore = create<Estado>((set) => ({
  visible: false,
  producto: null,
  abrir: (producto = null) => set({ visible: true, producto }),
  cerrar: () => set({ visible: false, producto: null }),
}));
