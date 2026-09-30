// src/components/TotemBotonActivar.tsx
// Botón chico, abajo a la izquierda, para entrar al MODO TÓTEM sin tener que
// escribir la URL con ?totem=1. Es para la expo: si la pantalla arranca en la
// web normal, se toca esto y queda en modo tótem.
//
// Solo aparece en la web de escritorio y SOLO cuando el modo tótem está
// apagado (una vez adentro, desaparece). En la APK no se renderiza nunca.
//
// TEMPORAL: después de la expo se borra este archivo y su línea en App.tsx.
import React from 'react';
import { Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { esTotem } from '../config/totem';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

export default function TotemBotonActivar() {
  const isDesktopWeb = useIsDesktopWeb();

  if (Platform.OS !== 'web' || esTotem() || !isDesktopWeb) return null;

  const activar = () => {
    try { window.localStorage.setItem('totem_mode', '1'); } catch {}
    // Recarga con el parámetro: así queda igual que entrar a mano por la URL.
    window.location.href = `${window.location.origin}/?totem=1`;
  };

  return (
    <Pressable style={s.boton} onPress={activar}>
      <Feather name="monitor" size={15} color="#FFFFFF" />
      <Text style={s.texto}>Modo tótem</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  boton: {
    position: 'fixed' as any, left: 16, bottom: 16, zIndex: 9990,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(43,43,43,0.85)', borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  texto: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 0.3 },
});
