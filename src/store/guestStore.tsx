// src/store/guestStore.tsx
// Modo invitado: navegación institucional SOLO para la versión web (nunca la
// APK). Un invitado puede ver el catálogo y descargar fotos/fichas, pero NO ve
// stock, precios de oferta, carrito, dashboard ni estadísticas. En vez de
// "agregar al carrito" se le ofrece contactar por WhatsApp.
//
// El flag se persiste en storage (en web = localStorage) para que un refresh o
// un link compartido mantengan al visitante dentro del modo invitado en vez de
// rebotarlo al login.
import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_KEY = 'guest_mode';

type GuestState = {
  isGuest: boolean;
  enterGuest: () => void;
  exitGuest: () => void;
  // Lee el flag persistido. Se llama una vez al arranque (AppNavigator) antes
  // de decidir la ruta inicial. En nativo nunca activa el modo invitado.
  hydrate: () => Promise<void>;
};

export const useGuestStore = create<GuestState>((set) => ({
  isGuest: false,

  enterGuest: () => {
    AsyncStorage.setItem(GUEST_KEY, 'true').catch(() => {});
    set({ isGuest: true });
  },

  exitGuest: () => {
    AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    set({ isGuest: false });
  },

  hydrate: async () => {
    // El modo invitado es exclusivo de la web; en la APK se ignora por completo.
    if (Platform.OS !== 'web') return;
    try {
      const v = await AsyncStorage.getItem(GUEST_KEY);
      if (v === 'true') set({ isGuest: true });
    } catch {}
  },
}));
