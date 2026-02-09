// src/navigation/MainTabs.tsx
import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCartStore } from '../store/cartStore';

// Screens
import Home from '../screens/Home';
import Productos from '../screens/Productos';
import User from '../screens/user';
import Carrito from '../screens/Carrito';
import MisVentas from '../screens/MisVentas';
import ProductoDetalle from '../screens/ProductoDetalle';
import Favoritos from '../screens/Favoritos';

// Icons
import HomeIcon from '../../assets/home.svg';
import CarritoIcon from '../../assets/carrito.svg';
import OfertaIcon from '../../assets/oferta.svg';
import UserIcon from '../../assets/user.svg';
import SumarPedido from '../../assets/sumarPedido.svg';

const Tab = createBottomTabNavigator();
const ProductStack = createNativeStackNavigator();

const COLORS = {
  barBg: '#333333',
  icon: '#FFFFFF',
  badge: '#FF4D4D',
};

const ICON_SIZE = 26;
const FAB_SIZE = 64;
const BAR_H   = 64;
const FAB_VERTICAL_ADJ = -12;
const FAB_RING = 3;

const useCartCount = () => {
  const items = useCartStore((state) => state.items);
  return items.reduce((total, item) => total + item.product_uom_qty, 0);
};

function ProductosStackNavigator() {
  return (
    <ProductStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductStack.Screen name="ProductosList" component={Productos} />
      <ProductStack.Screen name="ProductoDetalle" component={ProductoDetalle} />
    </ProductStack.Navigator>
  );
}

interface ScaleButtonProps {
  onPress: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  style?: any;
  scaleTo?: number;
}

const ScaleButton = ({ onPress, onLongPress, children, style, scaleTo = 0.85 }: ScaleButtonProps) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: scaleTo, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} onLongPress={onLongPress} style={style}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const MainTabs = () => {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(p) => <CustomTabBar {...p} />}>
        <Tab.Screen name="Home" component={Home} />
        <Tab.Screen name="Carrito" component={Carrito} />
        <Tab.Screen name="MisVentas" component={MisVentas} />
        <Tab.Screen name="Perfil" component={User} />
        <Tab.Screen name="Productos" component={ProductosStackNavigator} />
        <Tab.Screen name="Favoritos" component={Favoritos} />
      </Tab.Navigator>
    </View>
  );
};

const CustomTabBar = (props: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const cartCount = useCartCount();
  const visibleNames = ['Home', 'Carrito', 'MisVentas', 'Perfil'] as const;
  const routeByName = Object.fromEntries(props.state.routes.map(r => [r.name, r]));

  const pressRoute = (routeKey: string, routeName: string, isFocused: boolean) => {
    const e = props.navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!isFocused && !e.defaultPrevented) {
      if (routeName === 'Productos') {
        props.navigation.navigate(routeName, { screen: 'ProductosList' });
      } else {
        props.navigation.navigate(routeName as never);
      }
    } else if (isFocused && routeName === 'Productos') {
      props.navigation.navigate(routeName, { screen: 'ProductosList' });
    }
  };

  const goFab = () => props.navigation.navigate('Productos' as never);
  const safeBottom = insets.bottom;

  return (
    <>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: safeBottom, backgroundColor: COLORS.barBg }} pointerEvents="none" />
      <View style={[styles.bar, { bottom: safeBottom }]}>
        {visibleNames.slice(0, 2).map((name) => {
          const route = routeByName[name];
          if (!route) return null;
          const index = props.state.routes.findIndex(r => r.key === route.key);
          const isFocused = props.state.index === index;
          const { IconCmp } = getIconFor(name);

          return (
            <ScaleButton key={route.key} style={styles.tabBtn} onPress={() => pressRoute(route.key, route.name, isFocused)} onLongPress={() => props.navigation.emit({ type: 'tabLongPress', target: route.key })}>
              <View style={[styles.iconWrap, isFocused && styles.iconFocused]}>
                <IconCmp width={ICON_SIZE} height={ICON_SIZE} fill={isFocused ? '#FFD700' : COLORS.icon} />
                {name === 'Carrito' && cartCount > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View>
                )}
              </View>
            </ScaleButton>
          );
        })}

        <View style={{ width: FAB_SIZE }} />

        {visibleNames.slice(2).map((name) => {
          const route = routeByName[name];
          if (!route) return null;
          const index = props.state.routes.findIndex(r => r.key === route.key);
          const isFocused = props.state.index === index;
          const { IconCmp } = getIconFor(name);

          return (
            <ScaleButton 
                key={route.key} 
                style={styles.tabBtn} 
                onPress={() => { 
                    if (name === 'MisVentas') { 
                        // --- AQUÍ ESTÁ EL CAMBIO CLAVE ---
                        // Navegamos a Productos pasando ofertaMode y un timestamp para forzar el refresh
                        props.navigation.navigate('Productos', { 
                            screen: 'ProductosList', 
                            params: { 
                                ofertaMode: true, 
                                ts: Date.now() 
                            } 
                        }); 
                    } else { 
                        pressRoute(route.key, route.name, isFocused); 
                    } 
                }} 
                onLongPress={() => props.navigation.emit({ type: 'tabLongPress', target: route.key })}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconFocused]}>
                <IconCmp width={ICON_SIZE} height={ICON_SIZE} fill={isFocused ? '#FFD700' : COLORS.icon} />
              </View>
            </ScaleButton>
          );
        })}
      </View>

      <View style={[styles.fabPosition, { bottom: safeBottom + (BAR_H - FAB_SIZE / 2) + FAB_VERTICAL_ADJ }]} pointerEvents="box-none">
        <ScaleButton onPress={goFab} scaleTo={0.9}>
          <View style={styles.fabContainer}>
            <SumarPedido width={FAB_SIZE} height={FAB_SIZE} />
          </View>
        </ScaleButton>
      </View>
    </>
  );
};

function getIconFor(name: string) {
  switch (name) {
    case 'Home': return { IconCmp: HomeIcon };
    case 'Carrito': return { IconCmp: CarritoIcon };
    case 'MisVentas': return { IconCmp: OfertaIcon }; // Este icono representa Ofertas
    case 'Perfil': return { IconCmp: UserIcon };
    default: return { IconCmp: HomeIcon };
  }
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.barBg, paddingHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 12 },
  tabBtn: { width: 72, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  iconWrap: { position: 'relative', width: ICON_SIZE, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center' },
  iconFocused: { transform: [{ scale: 1.1 }] },
  badge: { position: 'absolute', top: -6, right: -12, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.badge, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  fabPosition: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  fabContainer: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 16, backgroundColor: COLORS.barBg, width: FAB_SIZE + FAB_RING * 2, height: FAB_SIZE + FAB_RING * 2, borderRadius: (FAB_SIZE + FAB_RING * 2) / 2, alignItems: 'center', justifyContent: 'center' }
});

export default MainTabs;