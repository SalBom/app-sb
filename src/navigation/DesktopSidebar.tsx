// src/navigation/DesktopSidebar.tsx
// Sidebar de navegación para la versión desktop web. Vive como hermano del
// Stack.Navigator completo (ver AppNavigator.tsx) para no quedar atrapado en el
// stacking context que arma react-navigation para las transiciones de pantalla,
// y por eso navega a través de `navigationRef` en vez del hook useNavigation().
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { navigationRef } from '../../App';
import { useCartStore } from '../store/cartStore';
import { getUserRoleFromStorage } from '../utils/authStorage';
import { useHelpCenterStore } from '../store/helpCenterStore';
import { useTourTarget } from '../hooks/useTourTarget';
import useIsGuest from '../hooks/useIsGuest';

import HomeIcon from '../../assets/home.svg';
import CarritoIcon from '../../assets/carrito.svg';
import OfertaIcon from '../../assets/oferta.svg';
import UserIcon from '../../assets/user.svg';

const COLLAPSED_W = 64;
const EXPANDED_W = 232;

// Wrapper para poder usar un ícono de Feather con la misma firma
// (width/height/fill) que los SVG del resto de los ítems del sidebar.
const AdminIcon = ({ width, fill }: { width?: number; height?: number; fill?: string }) => (
  <Feather name="shield" size={width || 22} color={fill} />
);
const CatalogoIcon = ({ width, fill }: { width?: number; height?: number; fill?: string }) => (
  <Feather name="grid" size={width || 22} color={fill} />
);

const NAV_ITEMS = [
  { name: 'Home', label: 'Home', IconCmp: HomeIcon },
  { name: 'Carrito', label: 'Carrito', IconCmp: CarritoIcon },
  { name: 'Productos', label: 'Catálogo', IconCmp: CatalogoIcon },
  { name: 'MisVentas', label: 'Ofertas', IconCmp: OfertaIcon },
  { name: 'Perfil', label: 'Perfil', IconCmp: UserIcon },
] as const;

// Ítem aparte (no vive en MainTabs, es una pantalla de Stack directa) — se
// agrega al final de la lista solo si el usuario logueado es ADMIN.
const ADMIN_ITEM = { name: 'AdminPanel', label: 'Admin', IconCmp: AdminIcon } as const;

const useCartCount = () => {
  const items = useCartStore((state) => state.items);
  return items.reduce((total, item) => total + item.product_uom_qty, 0);
};

export default function DesktopSidebar() {
  const [expanded, setExpanded] = useState(false);
  const [activeRoute, setActiveRoute] = useState<string | undefined>(undefined);
  const [rootRoute, setRootRoute] = useState<string | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const cartCount = useCartCount();
  const widthAnim = useRef(new Animated.Value(COLLAPSED_W)).current;
  const openHelp = useHelpCenterStore((s) => s.open);
  const carritoTourRef = useTourTarget('ir-carrito');
  const isGuest = useIsGuest();

  useEffect(() => {
    const checkRole = () => {
      getUserRoleFromStorage().then((role) => setIsAdmin(!!role && role.toUpperCase() === 'ADMIN'));
    };
    checkRole();
    const unsub = navigationRef.addListener?.('state', () => {
      // Ruta activa real dentro del Tab.Navigator anidado en "MainTabs"
      const state: any = navigationRef.getRootState?.();
      const mainTabsRoute = state?.routes?.find((r: any) => r.name === 'MainTabs');
      const tabState = mainTabsRoute?.state;
      const tabRouteName = tabState?.routes?.[tabState.index ?? 0]?.name;
      setActiveRoute(tabRouteName);
      setRootRoute(state?.routes?.[state?.index ?? 0]?.name);
      checkRole();
    });
    return unsub;
  }, []);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: expanded ? EXPANDED_W : COLLAPSED_W,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded]);

  const go = (routeName: string) => {
    if (!navigationRef.isReady()) return;
    if (routeName === 'AdminPanel') {
      navigationRef.navigate('AdminPanel' as never);
    } else if (routeName === 'Productos') {
      navigationRef.navigate('MainTabs' as never, { screen: 'Productos', params: { screen: 'ProductosList' } } as never);
    } else if (routeName === 'MisVentas') {
      navigationRef.navigate('MainTabs' as never, {
        screen: 'Productos',
        params: { screen: 'ProductosList', params: { ofertaMode: true, ts: Date.now() } },
      } as never);
    } else {
      navigationRef.navigate('MainTabs' as never, { screen: routeName } as never);
    }
    setExpanded(false);
  };

  // El invitado (web institucional) solo navega Home y Catálogo: sin carrito,
  // sin ofertas ni perfil/dashboard.
  const GUEST_ALLOWED = ['Home', 'Productos'];
  const navItems = isGuest
    ? NAV_ITEMS.filter((it) => GUEST_ALLOWED.includes(it.name))
    : (isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS);

  return (
    <>
      {expanded && (
        <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} />
      )}
      <Animated.View style={[styles.sidebar, { width: widthAnim }]}>
        <View>
          <Pressable style={styles.hamburgerBtn} onPress={() => setExpanded((v) => !v)}>
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </Pressable>

          <View style={styles.itemsList}>
            {navItems.map(({ name, label, IconCmp }) => {
              const isActive = name === 'AdminPanel' ? rootRoute === 'AdminPanel' : activeRoute === name;
              return (
                <Pressable
                  key={name}
                  ref={name === 'Carrito' ? carritoTourRef : undefined}
                  style={[styles.item, isActive && styles.itemActive, !expanded && styles.itemCollapsed]}
                  onPress={() => go(name)}
                >
                  <View style={styles.iconWrap}>
                    <IconCmp width={22} height={22} fill={isActive ? '#1C9BD8' : '#FFFFFF'} />
                    {name === 'Carrito' && cartCount > 0 && (
                      <View style={styles.badge}><Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View>
                    )}
                  </View>
                  {expanded && (
                    <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>{label}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {!isGuest && (
          <Pressable
            style={[styles.item, styles.helpItem, !expanded && styles.itemCollapsed]}
            onPress={() => { openHelp(); setExpanded(false); }}
          >
            <View style={styles.iconWrap}>
              <Feather name="help-circle" size={22} color="#FFFFFF" />
            </View>
            {expanded && <Text style={styles.label}>Ayuda</Text>}
          </Pressable>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'fixed' as any, left: 0, top: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)', zIndex: 40,
  },
  sidebar: {
    height: '100%', backgroundColor: '#2B2B2B', paddingTop: 20, paddingBottom: 16, overflow: 'hidden',
    justifyContent: 'space-between',
    zIndex: 50, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 4, height: 0 },
  },
  hamburgerBtn: { width: COLLAPSED_W, height: 44, alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 12 },
  hamburgerLine: { width: 22, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
  itemsList: { gap: 4 },
  item: {
    flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 20,
    marginHorizontal: 8, borderRadius: 10, gap: 14,
  },
  itemCollapsed: { paddingHorizontal: 0, marginHorizontal: 8, justifyContent: 'center' },
  itemActive: { backgroundColor: 'rgba(28,155,216,0.14)' },
  helpItem: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16, marginTop: 8, borderRadius: 0, marginHorizontal: 0, paddingHorizontal: 20 },
  iconWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  label: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#D9D9D9', letterSpacing: 0.3 },
  labelActive: { color: '#1C9BD8' },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#FF4D4D', paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
