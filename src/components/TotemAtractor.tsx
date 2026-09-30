// src/components/TotemAtractor.tsx
// Pantalla de atracción del tótem: cuando nadie lo usa hace un rato, tapa la
// web con una invitación grande a tocar. Sirve para dos cosas a la vez:
//  - de lejos se ve que la pantalla está viva y qué es (mucha gente ni se acerca
//    a un tótem que muestra una web quieta);
//  - al tocar, empieza siempre desde el catálogo, sin arrastrar la búsqueda ni
//    el producto que dejó abierto el visitante anterior.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Logo from '../../assets/logo.svg';
import { useTotemAtractorStore } from '../store/totemAtractorStore';
import { navigationRef } from '../../App';

export default function TotemAtractor() {
  const visible = useTotemAtractorStore((s) => s.visible);
  const ocultar = useTotemAtractorStore((s) => s.ocultar);
  const latido = useRef(new Animated.Value(1)).current;

  // Latido suave del texto: movimiento mínimo, lo justo para que no parezca
  // una pantalla congelada o apagada.
  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(latido, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible, latido]);

  if (!visible) return null;

  const empezar = () => {
    ocultar();
    try {
      if (navigationRef.isReady()) {
        (navigationRef.navigate as any)('MainTabs', {
          screen: 'Productos',
          params: { screen: 'ProductosList' },
        });
      }
      window.scrollTo({ top: 0 });
    } catch {}
  };

  return (
    <Pressable style={s.fondo} onPress={empezar}>
      <View style={s.centro}>
        {/* Mismo logo del encabezado (gris + azul): por eso el fondo es claro. */}
        <Logo width={430} height={86} />

        <Text style={s.titulo}>MÁQUINAS Y HERRAMIENTAS</Text>
        <Text style={s.bajada}>Más de 50 años equipando al sector ferretero</Text>

        <Animated.View style={[s.cta, { transform: [{ scale: latido }] }]}>
          <Feather name="maximize" size={34} color="#FFFFFF" />
          <Text style={s.ctaText}>TOCÁ LA PANTALLA PARA VER EL CATÁLOGO</Text>
        </Animated.View>

        <Text style={s.pie}>SHIMURA · ISSEI · MTD</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fondo: {
    // 'fixed': tapa la pantalla completa aunque la página esté scrolleada
    // (con 'absolute' el cartel quedaría arriba de todo y no se vería).
    position: 'fixed' as any, left: 0, top: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  centro: { alignItems: 'center', paddingHorizontal: 60 },
  titulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 62, lineHeight: 64, color: '#2B2B2B', textAlign: 'center', marginTop: 46 },
  bajada: { fontFamily: 'Rubik', fontSize: 22, color: '#6B7280', textAlign: 'center', marginTop: 14 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 70,
    backgroundColor: '#1C9BD8', paddingHorizontal: 44, paddingVertical: 26, borderRadius: 999,
  },
  ctaText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 30, color: '#FFFFFF', letterSpacing: 0.5 },
  pie: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, color: '#9CA3AF', letterSpacing: 3, marginTop: 70 },
});
