import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, Easing } from 'react-native';

// --- SafeSvg: evita warnings ---
const SafeSvg = ({ mod, width, height, style }: { mod: any; width: number; height: number; style?: any }) => {
  try {
    const Comp = mod?.default ?? mod;
    const isComponent = typeof Comp === 'function' || (Comp && typeof Comp === 'object' && '$$typeof' in Comp);
    if (isComponent) return <Comp width={width} height={height} style={style} />;
    return <View style={[{ width, height }, style]} />;
  } catch {
    return <View style={[{ width, height }, style]} />;
  }
};

import * as ComIconRaw from '../../assets/com_foto_2.svg';

type Step = 1 | 2 | 3;

interface Props {
  step: Step;
  title?: string;
  onBack?: () => void;
  showOrderBadge?: boolean;
  orderNumber?: string;
}

const CarritoHeader: React.FC<Props> = ({
  step,
  title = 'MI CARRITO',
  onBack,
  showOrderBadge = false,
  orderNumber,
}) => {
  
  // Animación para la barra de progreso
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Calculamos el porcentaje de la barra (0% en paso 1, 50% en paso 2, 100% en paso 3)
    let toValue = 0;
    if (step === 2) toValue = 0.5;
    if (step === 3) toValue = 1;

    Animated.timing(progressAnim, {
      toValue,
      duration: 350, // <-- AJUSTADO: Antes 500, ahora más rápido
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, 
    }).start();
  }, [step]);

  // Interpolación del ancho de la barra
  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Header Superior */}
      <View style={styles.headerTop}>
        <View style={styles.iconWrap}>
           <SafeSvg mod={ComIconRaw} width={53} height={28} />
        </View>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {/* Pasos */}
      <View style={styles.stepsContainer}>
        {/* Línea de fondo GRIS estática */}
        <View style={styles.lineBackground} />
        
        {/* Línea de progreso AZUL animada */}
        <View style={styles.lineProgressContainer}>
            <Animated.View style={[styles.lineProgressFill, { width: widthInterpolated }]} />
        </View>

        <View style={styles.bubblesRow}>
          <StepBubble number={1} label="PRODUCTOS" currentStep={step} />
          <StepBubble number={2} label="ENVÍO Y PAGO" currentStep={step} />
          <StepBubble number={3} label={'CONFIRMAR\nPEDIDO'} currentStep={step} />
        </View>
      </View>

      {showOrderBadge && !!orderNumber && (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>
            PEDIDO <Text style={styles.badgeNumber}>{orderNumber}</Text>
          </Text>
        </View>
      )}
    </View>
  );
};

// Componente Burbuja con Animación Interna
const StepBubble = ({ number, label, currentStep }: { number: number; label: string; currentStep: number }) => {
  const isActive = currentStep === number;
  
  // Valor animado: 1 si es activo, 0 si es inactivo
  const anim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isActive ? 1 : 0,
      duration: 300, // <-- AJUSTADO: Antes 400, ahora más rápido (más "snappy")
      easing: Easing.out(Easing.back(1.5)), 
      useNativeDriver: false, 
    }).start();
  }, [isActive]);

  // --- Interpolaciones ---

  // Tamaño: 26px -> 42px
  const size = anim.interpolate({ inputRange: [0, 1], outputRange: [26, 42] });
  
  // Radio: 13px -> 21px (mitad del tamaño)
  const radius = anim.interpolate({ inputRange: [0, 1], outputRange: [13, 21] });
  
  // Margen Superior: 0 -> -8 (para centrar)
  const marginTop = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  
  // Color de Fondo: #EBEBEB -> #009FE3
  const backgroundColor = anim.interpolate({ inputRange: [0, 1], outputRange: ['#EBEBEB', '#009FE3'] });
  
  // Borde Ancho: 0 -> 3
  const borderWidth = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });

  // Tamaño Fuente Número: 14 -> 20
  const fontSizeNum = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 20] });

  // Color Texto Número: #9E9E9E -> #FFFFFF
  const colorNum = anim.interpolate({ inputRange: [0, 1], outputRange: ['#9E9E9E', '#FFFFFF'] });

  return (
    <View style={styles.stepWrapper}>
      {/* Círculo Animado */}
      <Animated.View style={[
        styles.circleBase, 
        {
          width: size,
          height: size,
          borderRadius: radius,
          marginTop: marginTop,
          backgroundColor: backgroundColor,
          borderWidth: borderWidth,
          borderColor: '#fff',
        }
      ]}>
        <Animated.Text style={[styles.numBase, { fontSize: fontSizeNum, color: colorNum }]}>
          {number}
        </Animated.Text>
      </Animated.View>

      {/* Label (Texto inferior) */}
      <Text 
        style={isActive ? styles.labelActive : styles.labelInactive} 
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 5 : 5,
    paddingBottom: 5,
    paddingHorizontal: 0,
  },
  
  // --- Header Superior ---
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconWrap: {
    marginRight: 6,
    marginLeft: -4, 
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'BarlowCondensed-Bold', 
    fontWeight: '800',
    color: '#1E1E1E',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  backBtn: {
    marginLeft: 'auto',
    marginRight: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F3F3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // --- Pasos ---
  stepsContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    marginHorizontal: 15,
  },
  
  // Línea de fondo GRIS (Estática)
  lineBackground: {
    position: 'absolute',
    top: 13, 
    left: 35,
    right: 35,
    height: 2,
    backgroundColor: '#EBEBEB',
    zIndex: 0,
  },

  // Contenedor para la línea de progreso
  lineProgressContainer: {
    position: 'absolute',
    top: 13,
    left: 35,
    right: 35,
    height: 2,
    zIndex: 1, 
    overflow: 'hidden',
  },
  // Línea de relleno AZUL (Animada)
  lineProgressFill: {
    height: '100%',
    backgroundColor: '#009FE3',
  },

  bubblesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'flex-start',
    zIndex: 2, 
  },
  stepWrapper: {
    alignItems: 'center',
    width: 80,
  },
  
  // Base del círculo
  circleBase: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },

  // Base del número
  numBase: {
    fontFamily: 'BarlowCondensed-Bold',
    fontWeight: 'bold',
  },

  // Labels
  labelActive: {
    fontFamily: 'BarlowCondensed-Bold',
    fontWeight: '700',
    fontSize: 10,
    color: '#1E1E1E',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  labelInactive: {
    fontFamily: 'BarlowCondensed-Regular',
    fontWeight: '400',
    fontSize: 9,
    color: '#9E9E9E',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Badge Pedido
  badgeContainer: {
    marginTop: 5,
    backgroundColor: '#1E1E1E',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  badgeText: {
    color: '#FFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
  },
  badgeNumber: {
    color: '#009FE3',
  },
});

export default CarritoHeader;