// src/components/SkeletonProduct.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const OUTER_SIDE_PAD = 16;
// Mismas dimensiones que tu tarjeta real para que no haya saltos
const CARD_ASPECT_RATIO = 993 / 460; 
const CARD_WIDTH = SCREEN_W - OUTER_SIDE_PAD * 2;
const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT_RATIO);
const SHADOW_OFFSET = 5;
const BLUR_RADIUS = 3;
const SVG_PADDING = BLUR_RADIUS * 3;
const TOTAL_HEIGHT = CARD_HEIGHT + SHADOW_OFFSET + SVG_PADDING + 12;

const SkeletonProduct = () => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={[styles.container, { width: CARD_WIDTH, height: TOTAL_HEIGHT }]}>
      {/* Simulación del Card Container */}
      <View style={[styles.card, { height: CARD_HEIGHT }]}>
        
        {/* Columna Izquierda: Imagen */}
        <View style={styles.leftCol}>
          <Animated.View style={[styles.skeleton, { opacity, width: '70%', height: '70%', borderRadius: 8 }]} />
        </View>

        {/* Columna Derecha: Info */}
        <View style={styles.rightCol}>
          {/* Cuotas */}
          <Animated.View style={[styles.skeleton, { opacity, width: 60, height: 10, marginBottom: 12 }]} />
          
          {/* Precio (Grande) */}
          <Animated.View style={[styles.skeleton, { opacity, width: 120, height: 28, marginBottom: 12 }]} />
          
          {/* Título (2 líneas) */}
          <Animated.View style={[styles.skeleton, { opacity, width: '90%', height: 14, marginBottom: 6 }]} />
          <Animated.View style={[styles.skeleton, { opacity, width: '60%', height: 14, marginBottom: 12 }]} />
          
          {/* SKU */}
          <Animated.View style={[styles.skeleton, { opacity, width: 80, height: 10 }]} />

          {/* Acciones (Círculos abajo) */}
          <View style={styles.actionsRow}>
             <Animated.View style={[styles.skeleton, { opacity, width: 34, height: 34, borderRadius: 17 }]} />
             <Animated.View style={[styles.skeleton, { opacity, width: 34, height: 34, borderRadius: 17 }]} />
          </View>
        </View>

      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: OUTER_SIDE_PAD,
    marginBottom: 12,
    justifyContent: 'center', // Centrar verticalmente el contenido simulado por el padding SVG
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 0, // Tu tarjeta usa SVG, aquí usamos un bloque simple
    borderWidth: 1,
    borderColor: '#F3F4F6',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  skeleton: {
    backgroundColor: '#E1E4E8', // Color gris del esqueleto
    borderRadius: 4,
  },
  leftCol: {
    width: '40%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F9FAFB',
  },
  rightCol: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
});

export default SkeletonProduct;