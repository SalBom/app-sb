// src/hooks/useIsGuest.ts
// Atajo reactivo para saber si la sesión actual es un invitado (modo
// institucional web). Los componentes que lo usan se re-renderizan al
// entrar/salir del modo invitado. En nativo siempre devuelve false.
import { useGuestStore } from '../store/guestStore';

export default function useIsGuest(): boolean {
  return useGuestStore((s) => s.isGuest);
}
