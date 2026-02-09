// src/utils/authStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../config';

/** Claves centralizadas */
const KEYS = {
  AUTH: 'auth',           
  CUIT: 'cuit',           
  CUIT_ALT: 'user_cuit',  
  ROLE: 'user_role',      
  TOKEN: 'token',         
  PROFILE: 'user_profile' 
} as const;

/* =========================================================================
   Helpers genéricos
   ========================================================================= */
export async function setItem<T = any>(key: string, value: T): Promise<void> {
  try {
    const v = typeof value === 'string' ? (value as any) : JSON.stringify(value);
    await AsyncStorage.setItem(key, v);
  } catch {}
}

export async function getItem<T = any>(key: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return undefined;
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}

/* =========================================================================
   Funciones Específicas de Auth
   ========================================================================= */

export async function saveAuth(user: any) {
  await setItem(KEYS.AUTH, user);
}

export async function getAuth() {
  return getItem(KEYS.AUTH);
}

export async function clearAuth() {
  try {
    await AsyncStorage.multiRemove([KEYS.AUTH, KEYS.CUIT, KEYS.CUIT_ALT, KEYS.ROLE, KEYS.TOKEN]);
  } catch {}
}

// --- CUIT ---
export async function saveCuitToStorage(cuit: string) {
  if (!cuit) return;
  const c = cuit.replace(/[^0-9]/g, ''); 
  await setItem(KEYS.CUIT, c);
  await setItem(KEYS.CUIT_ALT, c); 
}

export async function getCuitFromStorage(): Promise<string | null> {
  let val = await getItem<string>(KEYS.CUIT);
  if (!val) val = await getItem<string>(KEYS.CUIT_ALT);
  return val || null;
}

// --- ROL ---
export async function saveUserRole(role: string) {
  await setItem(KEYS.ROLE, role);
}

export async function getUserRoleFromStorage(): Promise<string | null> {
  return (await getItem<string>(KEYS.ROLE)) || null;
}

// --- PERFIL ---
export type UserProfile = {
  cuit: string;
  name: string;
  image_128: string | null;
  savedAt: number; 
};

export async function saveUserProfile(cuit: string, name: string, image_128?: string | null) {
  try {
    const payload: UserProfile = { cuit, name, image_128: image_128 ?? null, savedAt: Date.now() };
    await setItem(KEYS.PROFILE, JSON.stringify(payload));
  } catch {}
}

export async function getUserProfile(cuit: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PROFILE);
    if (!raw) return null;
    const data = JSON.parse(raw) as UserProfile;
    return data;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
   saveUserSession
   Guarda CUIT, Rol y Objeto de sesión de una sola vez.
   ------------------------------------------------------------------------- */
export async function saveUserSession(session: { cuit: string; role: string; name?: string }) {
  try {
    // 1. Guardar objeto Auth completo
    await setItem(KEYS.AUTH, session);
    // 2. Guardar CUIT en sus keys específicas
    await saveCuitToStorage(session.cuit);
    // 3. Guardar Rol
    await setItem(KEYS.ROLE, session.role);
    // 4. Guardar Perfil básico si viene nombre
    if (session.name) {
       await saveUserProfile(session.cuit, session.name);
    }
  } catch (e) {
    console.error('Error guardando sesión:', e);
  }
}

/* -------------------------------------------------------------------------
   NUEVO: syncPushToken
   Envía el token de notificaciones al backend
   ------------------------------------------------------------------------- */
export async function syncPushToken(token: string) {
  try {
    const cuit = await getCuitFromStorage();
    if (!cuit || !token) return;

    await axios.post(`${API_URL}/auth/update_token`, {
        cuit: cuit,
        push_token: token
    });
    console.log("✅ Token Push sincronizado con backend");
  } catch (e) {
    console.log("Error sincronizando token push (quizás usuario no logueado)", e);
  }
}

/* =========================================================================
   DEFAULT EXPORT
   ========================================================================= */
const authStorage = {
  setItem,
  getItem,
  removeItem,
  saveAuth,
  getAuth,
  clearAuth,
  saveCuitToStorage,
  getCuitFromStorage,
  saveUserSession,
  getUserRoleFromStorage,
  saveUserProfile,
  getUserProfile,
  syncPushToken, // <--- Exportado aquí
  // Alias legacy
  getCUIT: getCuitFromStorage,
  getCuit: getCuitFromStorage,
  saveCuit: saveCuitToStorage,
};

export default authStorage;