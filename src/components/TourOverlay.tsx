// src/components/TourOverlay.tsx
// Motor + capa visual del tour guiado. Se monta una sola vez en la raíz de la
// app (ver AppNavigator.tsx). Hace dos cosas:
//  1) "Mira" el estado real de la app (carrito, cliente, plazo, pantalla
//     activa) para avanzar de paso solo cuando el usuario hizo de verdad la
//     acción pedida — no hay botón "Siguiente" que simule el progreso.
//  2) Dibuja el spotlight sobre el elemento real registrado por
//     useTourTarget para el paso activo, dejando ese elemento clickeable
//     (el recorte no es un truco visual: son 4 franjas oscuras alrededor que
//     sí capturan el toque, y el hueco del medio no tiene nada encima).
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useCartStore } from '../store/cartStore';
import { useTourStore, TOUR_STEPS } from '../store/tourStore';
import { navigationRef } from '../../App';

function getActiveTabRouteName(): string | undefined {
  const state: any = navigationRef.getRootState?.();
  const mainTabsRoute = state?.routes?.find((r: any) => r.name === 'MainTabs');
  const tabState = mainTabsRoute?.state;
  return tabState?.routes?.[tabState.index ?? 0]?.name;
}

const TourOverlay = () => {
  const active = useTourStore((s) => s.active);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const rects = useTourStore((s) => s.rects);
  const stop = useTourStore((s) => s.stop);
  const next = useTourStore((s) => s.next);
  const prev = useTourStore((s) => s.prev);
  const { width: vw, height: vh } = useWindowDimensions();

  const itemsCount = useCartStore((s) => s.items.length);
  const cliente = useCartStore((s) => s.clienteSeleccionado);
  const plazo = useCartStore((s) => s.plazoSeleccionado);
  const prevSnapshot = useRef({ itemsCount, cliente, plazo });

  const step = TOUR_STEPS[stepIndex];

  // Avance automático: solo reacciona a cambios reales de estado, no a un
  // "Siguiente" simulado. El usuario tiene que hacer la acción de verdad.
  useEffect(() => {
    if (!active) { prevSnapshot.current = { itemsCount, cliente, plazo }; return; }
    const prevS = prevSnapshot.current;

    if (step.id === 'agregar-producto' && itemsCount > prevS.itemsCount) next();
    else if (step.id === 'cliente' && !!cliente && !prevS.cliente) next();
    else if (step.id === 'plazo' && !!plazo && !prevS.plazo) next();

    prevSnapshot.current = { itemsCount, cliente, plazo };
  }, [active, step?.id, itemsCount, cliente, plazo, next]);

  // El paso "ir-carrito" depende de la navegación (no de cartStore), así que
  // se escucha aparte con el listener del navigationRef.
  useEffect(() => {
    if (!active) return;
    const check = () => {
      if (useTourStore.getState().active && TOUR_STEPS[useTourStore.getState().stepIndex]?.id === 'ir-carrito' && getActiveTabRouteName() === 'Carrito') {
        next();
      }
    };
    check();
    return navigationRef.addListener?.('state', check);
  }, [active, next]);

  if (!active) return null;

  const rect = rects[step.id];
  const TOOLTIP_W = 240;
  const pad = 6;

  if (!rect) {
    // El elemento de este paso todavía no está en pantalla (ej. el usuario
    // no llegó al carrito todavía) — mostramos solo la instrucción flotante,
    // sin recorte, para no tapar nada a ciegas.
    return (
      <View style={s.root} pointerEvents="box-none">
        <View style={[s.tooltip, { left: vw / 2 - TOOLTIP_W / 2, top: vh - 140, width: TOOLTIP_W }]}>
          <Text style={s.stepCount}>Paso {stepIndex + 1} de {TOUR_STEPS.length}</Text>
          <Text style={s.stepText}>{step.text}</Text>
          <Pressable onPress={stop} hitSlop={6}><Text style={s.skipText}>Salir del tour</Text></Pressable>
        </View>
      </View>
    );
  }

  const top = Math.max(0, rect.y - pad);
  const bottom = Math.min(vh, rect.y + rect.height + pad);
  const left = Math.max(0, rect.x - pad);
  const right = Math.min(vw, rect.x + rect.width + pad);

  let tooltipTop = bottom + 14;
  if (tooltipTop + 150 > vh) tooltipTop = Math.max(8, top - 150);
  let tooltipLeft = left;
  if (tooltipLeft + TOOLTIP_W + 12 > vw) tooltipLeft = vw - TOOLTIP_W - 12;
  if (tooltipLeft < 8) tooltipLeft = 8;

  return (
    <View style={s.root} pointerEvents="box-none">
      <Pressable style={[s.dim, { left: 0, top: 0, width: vw, height: top }]} onPress={() => {}} />
      <Pressable style={[s.dim, { left: 0, top: bottom, width: vw, height: Math.max(0, vh - bottom) }]} onPress={() => {}} />
      <Pressable style={[s.dim, { left: 0, top, width: left, height: bottom - top }]} onPress={() => {}} />
      <Pressable style={[s.dim, { left: right, top, width: Math.max(0, vw - right), height: bottom - top }]} onPress={() => {}} />
      <View pointerEvents="none" style={[s.ring, { left, top, width: right - left, height: bottom - top }]} />

      <View style={[s.tooltip, { left: tooltipLeft, top: tooltipTop, width: TOOLTIP_W }]}>
        <Text style={s.stepCount}>Paso {stepIndex + 1} de {TOUR_STEPS.length}</Text>
        <Text style={s.stepText}>{step.text}</Text>
        <View style={s.footer}>
          <Pressable onPress={stop} hitSlop={6}><Text style={s.skipText}>Salir del tour</Text></Pressable>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {stepIndex > 0 && (
              <Pressable style={s.ghostBtn} onPress={prev}><Text style={s.ghostBtnText}>Atrás</Text></Pressable>
            )}
            <Pressable
              style={s.nextBtn}
              onPress={() => (stepIndex === TOUR_STEPS.length - 1 ? stop() : next())}
            >
              <Text style={s.nextBtnText}>{stepIndex === TOUR_STEPS.length - 1 ? 'Listo' : 'Siguiente'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { position: 'fixed' as any, left: 0, top: 0, right: 0, bottom: 0, zIndex: 9999 },
  dim: { position: 'absolute', backgroundColor: 'rgba(20,20,20,0.55)' },
  ring: { position: 'absolute', borderRadius: 10, borderWidth: 2, borderColor: '#1C9BD8' },
  tooltip: {
    position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 12,
    padding: 14, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  stepCount: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', marginBottom: 6 },
  stepText: { fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', lineHeight: 18, marginBottom: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipText: { fontFamily: 'Rubik', fontSize: 12, color: '#9CA3AF' },
  ghostBtn: { borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  ghostBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: '#2B2B2B' },
  nextBtn: { backgroundColor: '#1C9BD8', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  nextBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: '#FFFFFF', letterSpacing: 0.3 },
});

export default TourOverlay;
