// src/components/Visor3DModal.tsx
// Visor 3D del producto (solo web). Se abre a pantalla completa desde la ficha:
// el modelo se gira con el dedo, se acerca con dos dedos y gira solo mientras
// nadie lo toca. En el tótem es lo que más engancha a la gente.
//
// Usa <model-viewer> de Google, servido desde nuestra propia web
// (public/model-viewer.min.js). Se carga recién cuando alguien abre un modelo,
// así la web normal no arrastra 1 MB de más, y no entra en el APK.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

const SCRIPT_ID = 'model-viewer-script';

/** Carga el visor una sola vez. Devuelve false si no se pudo. */
function cargarVisor(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if ((window as any).customElements?.get('model-viewer')) return Promise.resolve(true);

  const existente = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  const script = existente || document.createElement('script');
  const listo = new Promise<boolean>((resolve) => {
    script.addEventListener('load', () => resolve(true));
    script.addEventListener('error', () => resolve(false));
  });
  if (!existente) {
    script.id = SCRIPT_ID;
    script.type = 'module';
    script.src = '/model-viewer.min.js';
    document.head.appendChild(script);
  }
  return listo;
}

type Props = {
  visible: boolean;
  url: string | null;
  nombre?: string | null;
  onClose: () => void;
};

export default function Visor3DModal({ visible, url, nombre, onClose }: Props) {
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const contenedor = useRef<any>(null);

  useEffect(() => {
    if (!visible || !url) return;
    let activo = true;
    setEstado('cargando');

    cargarVisor().then((ok) => {
      if (!activo) return;
      if (!ok) { setEstado('error'); return; }
      const nodo = contenedor.current;
      if (!nodo || typeof document === 'undefined') { setEstado('error'); return; }

      // El elemento se crea a mano (no con JSX) porque es un web component:
      // React Native Web no conoce la etiqueta <model-viewer>.
      nodo.innerHTML = '';
      const mv: any = document.createElement('model-viewer');
      mv.setAttribute('src', url);
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('touch-action', 'none');   // que el gesto gire el modelo y no scrollee la página
      mv.setAttribute('auto-rotate', '');
      mv.setAttribute('auto-rotate-delay', '1500');
      mv.setAttribute('rotation-per-second', '18deg');
      mv.setAttribute('interaction-prompt', 'none');
      mv.setAttribute('shadow-intensity', '1');
      mv.setAttribute('exposure', '1');
      mv.setAttribute('loading', 'eager');       // sin esto espera a "ser visible" y no carga nunca
      mv.style.width = '100%';
      mv.style.height = '100%';
      mv.style.backgroundColor = '#F3F4F6';
      mv.addEventListener('load', () => activo && setEstado('listo'));
      mv.addEventListener('error', () => activo && setEstado('error'));
      nodo.appendChild(mv);
    });

    return () => {
      activo = false;
      if (contenedor.current) contenedor.current.innerHTML = '';
    };
  }, [visible, url]);

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fondo}>
        <View style={s.barra}>
          <Feather name="box" size={22} color="#1C9BD8" />
          <Text style={s.titulo} numberOfLines={1}>{nombre || 'Modelo 3D'}</Text>
          <Pressable style={s.cerrar} onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color="#2B2B2B" />
            <Text style={s.cerrarText}>Cerrar</Text>
          </Pressable>
        </View>

        <View style={s.escena}>
          {/* @ts-ignore: en web el ref es el nodo del DOM, que es lo que necesitamos */}
          <View ref={contenedor} style={s.lienzo} />

          {estado === 'cargando' && (
            <View style={s.aviso} pointerEvents="none">
              <ActivityIndicator size="large" color="#1C9BD8" />
              <Text style={s.avisoText}>Cargando el modelo…</Text>
            </View>
          )}
          {estado === 'error' && (
            <View style={s.aviso}>
              <Feather name="alert-triangle" size={28} color="#B45309" />
              <Text style={s.avisoText}>No se pudo cargar el modelo 3D.</Text>
            </View>
          )}
        </View>

        <View style={s.pie}>
          <Feather name="rotate-cw" size={18} color="#6B7280" />
          <Text style={s.pieText}>Arrastrá para girarlo · Pellizcá para acercar</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#FFFFFF' },
  barra: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#EFEFEF',
  },
  titulo: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 24, color: '#2B2B2B' },
  cerrar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB' },
  cerrarText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },

  escena: { flex: 1, backgroundColor: '#F3F4F6' },
  lienzo: { flex: 1 },
  aviso: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
  avisoText: { fontFamily: 'Rubik', fontSize: 15, color: '#6B7280' },

  pie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#EFEFEF' },
  pieText: { fontFamily: 'Rubik', fontSize: 15, color: '#6B7280' },
});
