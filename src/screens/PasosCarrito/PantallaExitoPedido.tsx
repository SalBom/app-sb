import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// --- Definición correcta de Props ---
interface Props {
  nroPedido: string;
  onVolver: () => void; // <--- Coincide con onBack
  montoTotal?: number;  // <--- Opcional, para mostrar el total
}

export default function PantallaExitoPedido({ nroPedido, onVolver, montoTotal }: Props) {
  const insets = useSafeAreaInsets();
  
  // Animaciones
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true
      }),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true
        })
      ])
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconCircle, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark" size={60} color="#FFF" />
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%', alignItems: 'center' }}>
        <Text style={styles.title}>¡PEDIDO CONFIRMADO!</Text>
        <Text style={styles.subtitle}>Hemos recibido tu pedido correctamente.</Text>

        <View style={styles.infoCard}>
          <Text style={styles.label}>NÚMERO DE PEDIDO</Text>
          <Text style={styles.orderNumber}>{nroPedido}</Text>
          
          {/* Si hay monto total, lo mostramos */}
          {montoTotal !== undefined && (
            <>
              <View style={styles.divider} />
              <Text style={styles.label}>TOTAL ESTIMADO</Text>
              <Text style={styles.totalAmount}>USD {montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
            </>
          )}
        </View>

        <Text style={styles.helpText}>
          Te enviamos un correo con el detalle.{'\n'}
          Puedes ver el estado en "Mis Pedidos".
        </Text>
      </Animated.View>

      <TouchableOpacity style={[styles.btn, { marginBottom: insets.bottom + 20 }]} onPress={onVolver}>
        <Text style={styles.btnText}>VOLVER AL INICIO</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', marginBottom: 30, shadowColor: "#4CAF50", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#2B2B2B', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center' },
  infoCard: { width: '100%', backgroundColor: '#F8F9FA', borderRadius: 16, padding: 25, alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#EEE' },
  label: { fontSize: 12, color: '#888', fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  orderNumber: { fontSize: 30, fontWeight: '800', color: '#1C9BD8' },
  divider: { width: '40%', height: 1, backgroundColor: '#DDD', marginVertical: 15 },
  totalAmount: { fontSize: 24, fontWeight: '600', color: '#333' },
  helpText: { textAlign: 'center', color: '#999', fontSize: 13, lineHeight: 20, marginBottom: 40 },
  btn: { width: '100%', backgroundColor: '#1C9BD8', paddingVertical: 16, borderRadius: 30, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 },
  btnText: { color: '#FFF', fontWeight: '800', fontSize: 18, letterSpacing: 1 }
});