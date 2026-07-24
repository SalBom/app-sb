// src/store/helpCenterStore.tsx
// Estado global mínimo para abrir el Centro de Ayuda desde cualquier punto de
// la app (botón del sidebar en desktop, botón del header en mobile) sin tener
// que pasar props entre componentes que no son padre/hijo entre sí.
import { create } from 'zustand';

type HelpCenterState = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useHelpCenterStore = create<HelpCenterState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
