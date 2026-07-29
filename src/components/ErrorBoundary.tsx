// src/components/ErrorBoundary.tsx
// Red de seguridad global: si cualquier pantalla lanza un error al renderizar,
// React desmonta TODO el árbol y el usuario queda con una pantalla en blanco,
// sin ningún mensaje ni forma de saber qué pasó. Este boundary lo intercepta y
// muestra un aviso legible + el detalle del error (para que el vendedor pueda
// mandarnos la captura) + una salida para seguir trabajando.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // Queda en la consola del navegador / logcat para diagnóstico.
    console.error('💥 Error no controlado en la app:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  recargar = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.reset();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children as any;

    return (
      <View style={s.wrap}>
        <View style={s.card}>
          <View style={s.iconCircle}>
            <Feather name="alert-triangle" size={28} color="#B91C1C" />
          </View>

          <Text style={s.title}>Algo salió mal</Text>
          <Text style={s.desc}>
            La pantalla no se pudo mostrar. Tu pedido puede haberse guardado igual:
            revisá en <Text style={s.bold}>“Mis Pedidos”</Text> antes de volver a cargarlo.
          </Text>

          <ScrollView style={s.detailBox} contentContainerStyle={{ padding: 10 }}>
            <Text style={s.detailText} selectable>
              {String(error?.message || error)}
            </Text>
          </ScrollView>
          <Text style={s.hint}>
            Sacale una captura a este texto y mandalo a soporte: nos dice exactamente dónde falló.
          </Text>

          <Pressable style={s.btn} onPress={this.recargar}>
            <Feather name="refresh-cw" size={16} color="#FFFFFF" />
            <Text style={s.btnText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 460, alignItems: 'center' },
  iconCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontFamily: 'BarlowCondensed-Bold', fontSize: 26, color: '#2B2B2B', marginBottom: 8, textAlign: 'center' },
  desc: { fontFamily: 'Rubik', fontSize: 14, color: '#4B5563', lineHeight: 21, textAlign: 'center', marginBottom: 18 },
  bold: { fontWeight: '700', color: '#2B2B2B' },
  detailBox: { maxHeight: 130, width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  detailText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11.5, color: '#B91C1C', lineHeight: 16 },
  hint: { fontFamily: 'Rubik', fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1C9BD8', height: 48, borderRadius: 999, paddingHorizontal: 28 },
  btnText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 0.5 },
});
