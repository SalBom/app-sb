// src/components/VisorFotoModal.tsx
// Visor de fotos a pantalla completa (solo web): se abre al tocar la foto del
// producto y permite mirarla de cerca. Pensado para el tótem, donde la gente
// quiere ver el detalle de la máquina y no hay mouse:
//   - pellizcar con dos dedos para acercar (y rueda del mouse en escritorio);
//   - arrastrar para moverse cuando está ampliada;
//   - botones grandes de + / − / restablecer, por si no usan el pellizco;
//   - flechas para pasar a las otras fotos del producto.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';

const ESCALA_MIN = 1;
const ESCALA_MAX = 5;

type Props = {
  visible: boolean;
  fotos: string[];
  indiceInicial?: number;
  onClose: () => void;
};

export default function VisorFotoModal({ visible, fotos, indiceInicial = 0, onClose }: Props) {
  const [indice, setIndice] = useState(indiceInicial);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Refs para los gestos: no pasan por el estado para no re-renderizar en cada
  // movimiento del dedo.
  const punteros = useRef<Map<number, { x: number; y: number }>>(new Map());
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pellizco = useRef<{ distancia: number; escala: number } | null>(null);
  const escalaRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });

  const aplicar = useCallback((nuevaEscala: number, nuevaPos: { x: number; y: number }) => {
    const e = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, nuevaEscala));
    // Sin zoom la foto siempre vuelve al centro: si no, queda corrida.
    const p = e <= 1 ? { x: 0, y: 0 } : nuevaPos;
    escalaRef.current = e; posRef.current = p;
    setEscala(e); setPos(p);
  }, []);

  const reiniciar = useCallback(() => aplicar(1, { x: 0, y: 0 }), [aplicar]);

  useEffect(() => {
    if (visible) { setIndice(indiceInicial); reiniciar(); }
  }, [visible, indiceInicial, reiniciar]);

  const cambiarFoto = (paso: number) => {
    if (fotos.length < 2) return;
    setIndice((i) => (i + paso + fotos.length) % fotos.length);
    reiniciar();
  };

  // Los gestos se enganchan al nodo del DOM: React Native Web no expone
  // multitouch (el pellizco) por sus props de toque.
  const quitarListeners = useRef<(() => void) | null>(null);
  const zonaRef = useCallback((nodo: any) => {
    quitarListeners.current?.();
    quitarListeners.current = null;
    if (!nodo || typeof nodo.addEventListener !== 'function') return;

    const distanciaEntreDedos = () => {
      const [a, b] = [...punteros.current.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e: PointerEvent) => {
      // Si la captura falla (pasa con algunos navegadores y punteros raros) el
      // gesto tiene que seguir funcionando igual.
      try { nodo.setPointerCapture?.(e.pointerId); } catch {}
      punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.current.size === 2) {
        pellizco.current = { distancia: distanciaEntreDedos(), escala: escalaRef.current };
        arrastre.current = null;
      } else if (punteros.current.size === 1 && escalaRef.current > 1) {
        arrastre.current = { x: e.clientX, y: e.clientY, px: posRef.current.x, py: posRef.current.y };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!punteros.current.has(e.pointerId)) return;
      punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (punteros.current.size === 2 && pellizco.current) {
        const factor = distanciaEntreDedos() / (pellizco.current.distancia || 1);
        aplicar(pellizco.current.escala * factor, posRef.current);
      } else if (arrastre.current) {
        aplicar(escalaRef.current, {
          x: arrastre.current.px + (e.clientX - arrastre.current.x),
          y: arrastre.current.py + (e.clientY - arrastre.current.y),
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      punteros.current.delete(e.pointerId);
      if (punteros.current.size < 2) pellizco.current = null;
      if (punteros.current.size === 0) arrastre.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      aplicar(escalaRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), posRef.current);
    };

    nodo.addEventListener('pointerdown', onDown);
    nodo.addEventListener('pointermove', onMove);
    nodo.addEventListener('pointerup', onUp);
    nodo.addEventListener('pointercancel', onUp);
    nodo.addEventListener('wheel', onWheel, { passive: false });
    quitarListeners.current = () => {
      nodo.removeEventListener('pointerdown', onDown);
      nodo.removeEventListener('pointermove', onMove);
      nodo.removeEventListener('pointerup', onUp);
      nodo.removeEventListener('pointercancel', onUp);
      nodo.removeEventListener('wheel', onWheel);
    };
  }, [aplicar]);

  if (Platform.OS !== 'web' || !visible || !fotos.length) return null;

  const foto = fotos[Math.min(indice, fotos.length - 1)];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fondo}>
        <View style={s.barra}>
          <Feather name="zoom-in" size={20} color="#FFFFFF" />
          <Text style={s.contador}>
            {fotos.length > 1 ? `Foto ${indice + 1} de ${fotos.length}` : 'Foto del producto'}
          </Text>
          <Pressable style={s.cerrar} onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color="#FFFFFF" />
            <Text style={s.cerrarText}>Cerrar</Text>
          </Pressable>
        </View>

        {/* @ts-ignore: en web el ref es el nodo del DOM, que es lo que necesitamos */}
        <View ref={zonaRef} style={s.escena}>
          <Image
            source={{ uri: foto }}
            style={[s.foto, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale: escala }] }]}
            contentFit="contain"
          />
        </View>

        {fotos.length > 1 && (
          <>
            <Pressable style={[s.flecha, s.flechaIzq]} onPress={() => cambiarFoto(-1)}>
              <Feather name="chevron-left" size={34} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[s.flecha, s.flechaDer]} onPress={() => cambiarFoto(1)}>
              <Feather name="chevron-right" size={34} color="#FFFFFF" />
            </Pressable>
          </>
        )}

        <View style={s.controles}>
          <Pressable style={s.btn} onPress={() => aplicar(escalaRef.current / 1.4, posRef.current)}>
            <Feather name="minus" size={24} color="#FFFFFF" />
          </Pressable>
          <Pressable style={s.btn} onPress={reiniciar}>
            <Text style={s.btnText}>{Math.round(escala * 100)}%</Text>
          </Pressable>
          <Pressable style={s.btn} onPress={() => aplicar(escalaRef.current * 1.4, posRef.current)}>
            <Feather name="plus" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <Text style={s.ayuda}>
          {escala > 1 ? 'Arrastrá para moverte · Tocá el % para volver al tamaño original'
                      : 'Pellizcá o usá + para acercar'}
        </Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(17,20,23,0.97)' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 16 },
  contador: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#FFFFFF' },
  cerrar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  cerrarText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#FFFFFF' },

  escena: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', touchAction: 'none' } as any,
  foto: { width: '100%', height: '100%' },

  flecha: {
    position: 'absolute', top: '50%', marginTop: -32,
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  flechaIzq: { left: 20 },
  flechaDer: { right: 20 },

  controles: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingBottom: 8 },
  btn: { minWidth: 72, height: 56, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF' },

  ayuda: { fontFamily: 'Rubik', fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingVertical: 16 },
});
