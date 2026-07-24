// src/navigation/AppNavigator.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Platform } from 'react-native';
import axios from 'axios';
import { API_URL } from '../config';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getUserRoleFromStorage, getRememberMe, clearAuth, getCuitFromStorage, getUserProfile } from '../utils/authStorage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';
import DesktopSidebar from './DesktopSidebar';
import { navigationRef } from '../../App';
import { useCartStore } from '../store/cartStore';
import { Feather } from '@expo/vector-icons';
import HelpCenterModal from '../components/HelpCenterModal';
import { useHelpCenterStore } from '../store/helpCenterStore';
import TourOverlay from '../components/TourOverlay';
import useIsGuest from '../hooks/useIsGuest';
import { useGuestStore } from '../store/guestStore';

// Iconos del header desktop (carrito + avatar de usuario)
import CarritoIcon from '../../assets/carrito.svg';
import UserIcon from '../../assets/user.svg';

import Login from '../screens/Login';
import FacturaPDF from '../screens/FacturaPDF';
import ProductoDetalle from '../screens/ProductoDetalle';
import DashboardVendedor from '../screens/DashboardVendedor';
import MainTabs from './MainTabs';
import Descargas from '../screens/Descargas';
import TableroVendedor from '../screens/TableroVendedor';
import Pedidos from '../screens/pedidos';
import Facturas from '../screens/facturas';
import AdminPanel from '../screens/AdminPanel';
import GestionUsuarios from '../screens/GestionUsuarios';

// Logo de Sal-Bom
import Logo from '../../assets/logo.svg';
import EditUser from '../screens/editUser';
import ListadoClientes from '../screens/ListadoClientes';
import FacturasVendedor from '../screens/FacturasVendedor';
import AdminPromociones from '../screens/AdminPromociones';
import AdminNuevaPromo from '../screens/AdminNuevaPromo';
import DashboardAdministrador from '../screens/DashboardAdministrador';
import AdminBanners from '../screens/AdminBanners';
import AdminPlazos from '../screens/AdminPlazos';

const Stack = createNativeStackNavigator<RootStackParamList>();

const useCartCount = () => {
  const items = useCartStore((state) => state.items);
  return items.reduce((total, item) => total + item.product_uom_qty, 0);
};

// Header global con logo centrado. En desktop web se agrega, superpuesto a la
// derecha (sin afectar el centrado del logo que usa mobile/native), un cluster
// con el carrito y un placeholder de avatar del usuario logueado.
const SalBomHeader = ({ isDesktopWeb }: { isDesktopWeb: boolean }) => {
  const insets = useSafeAreaInsets();
  const cartCount = useCartCount();
  const [profileImg, setProfileImg] = useState<string | null>(null);
  const [tipoCambio, setTipoCambio] = useState<string | null>(null);
  const openHelp = useHelpCenterStore((s) => s.open);
  const isGuest = useIsGuest();
  const exitGuest = useGuestStore((s) => s.exitGuest);

  // Tipo de cambio: mismo valor que el pop-up del Home (config/popup_tc), no el
  // de Odoo, para que header y pop-up SIEMPRE coincidan. Solo se muestra en
  // escritorio web (no en mobile web ni en la APK), así que solo se pide ahí.
  useEffect(() => {
    if (!isDesktopWeb) return;
    let active = true;
    axios.get(`${API_URL}/config/popup_tc`).then((res) => {
      if (!active) return;
      const r = res.data?.rate;
      if (r != null && String(r).trim() !== '') setTipoCambio(String(r).trim());
    }).catch(() => {});
    return () => { active = false; };
  }, [isDesktopWeb]);

  const goLogin = () => {
    exitGuest();
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Login' as never);
  };

  useEffect(() => {
    if (!isDesktopWeb) return;
    (async () => {
      const cuit = await getCuitFromStorage();
      if (!cuit) return;
      const profile = await getUserProfile(cuit);
      if (profile?.image_128) setProfileImg(profile.image_128);
    })();
  }, [isDesktopWeb]);

  const goCart = () => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('MainTabs' as never, { screen: 'Carrito' } as never);
  };
  const goProfile = () => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('MainTabs' as never, { screen: 'Perfil' } as never);
  };

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
      {/* Tipo de cambio (mismo valor que el pop-up). Solo en escritorio web:
          en mobile web y en la APK no se muestra. */}
      {isDesktopWeb && (
        <View style={[styles.headerLeftInfo, { left: 40 }]}>
          <Text style={styles.tcLabel}>TIPO DE CAMBIO</Text>
          <Text style={styles.tcValue}>{tipoCambio ? `$${tipoCambio}` : '—'}</Text>
        </View>
      )}

      <Logo width={220} height={80} />
      {isDesktopWeb ? (
        isGuest ? (
          // Invitado (escritorio): acceso para iniciar sesión. En mobile este
          // botón NO va: el invitado inicia sesión desde la tab "Perfil".
          <View style={[styles.headerRightIcons, { right: 40 }]}>
            <Pressable style={styles.loginPill} onPress={goLogin}>
              <Feather name="log-in" size={16} color="#1C9BD8" />
              <Text style={styles.loginPillText}>Ingresar</Text>
            </Pressable>
          </View>
        ) : (
          // Usuario logueado (escritorio): carrito + avatar. El botón de ayuda
          // vive al pie del sidebar (ver DesktopSidebar.tsx).
          <View style={[styles.headerRightIcons, { right: 40 }]}>
            <Pressable style={styles.headerIconBtn} onPress={goCart}>
              <CarritoIcon width={22} height={22} fill="#2B2B2B" />
              {cartCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={styles.headerAvatarBtn} onPress={goProfile}>
              {profileImg ? (
                <Image source={{ uri: `data:image/png;base64,${profileImg}` }} style={styles.headerAvatarImg} />
              ) : (
                <UserIcon width={18} height={18} fill="#FFFFFF" />
              )}
            </Pressable>
          </View>
        )
      ) : isGuest ? (
        // Invitado en mobile: header sin botones (ni "Ingresar" ni tipo de
        // cambio). El acceso a login está en la tab "Perfil".
        null
      ) : (
        // Usuario logueado en mobile: botón de ayuda (no hay sidebar).
        <View style={[styles.headerRightIcons, { right: 16 }]}>
          <Pressable style={styles.headerIconBtn} onPress={openHelp}>
            <Feather name="help-circle" size={20} color="#2B2B2B" />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const AppNavigator = () => {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isDesktopWeb = useIsDesktopWeb();
  const isGuest = useIsGuest();

  // Ruta activa del Stack raíz, actualizada en vivo. La necesitamos porque
  // `userRole` solo se lee una vez al montar (desde el storage): un login
  // exitoso navega directo a "MainTabs" sin pasar por acá, así que ese estado
  // queda desactualizado y el sidebar no debe depender de él para mostrarse/ocultarse.
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchUserRole = async () => {
      const isRemembered = await getRememberMe();

      let role = '';
      if (isRemembered) {
        role = (await getUserRoleFromStorage()) || '';
        setUserRole(role);
      } else {
        await clearAuth();
        setUserRole('');
      }
      // Recupera el flag de invitado (web) antes de decidir la ruta inicial, así
      // un refresh mantiene al visitante en el catálogo en vez de rebotarlo al login.
      await useGuestStore.getState().hydrate();

      if (role) {
        // Sesión real: nunca invitado (por si quedó un flag viejo persistido).
        useGuestStore.getState().exitGuest();
      } else if (Platform.OS === 'web') {
        // Primera visita a la web sin sesión: entra como invitado y cae en Home
        // (no en el login). El login queda accesible por el botón "Ingresar".
        // En la APK no aplica (enterGuest no persiste en nativo).
        useGuestStore.getState().enterGuest();
      }

      setLoading(false);
    };

    fetchUserRole();
  }, []);

  useEffect(() => {
    const updateRoute = () => setCurrentRouteName(navigationRef.getCurrentRoute?.()?.name);
    updateRoute();
    return navigationRef.addListener?.('state', updateRoute);
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  }

  const showSidebar = isDesktopWeb && !!currentRouteName && currentRouteName !== 'Login';

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {showSidebar && <DesktopSidebar />}
      <HelpCenterModal />
      <TourOverlay />
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Stack.Navigator
          initialRouteName={(userRole || isGuest) ? "MainTabs" : "Login"}
          screenOptions={{
            header: () => <SalBomHeader isDesktopWeb={isDesktopWeb} />,
          }}
        >
          <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
          <Stack.Screen name="FacturaPDF" component={FacturaPDF} />
          <Stack.Screen name="ProductoDetalle" component={ProductoDetalle} />
          <Stack.Screen name="DashboardVendedor" component={DashboardVendedor} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Descargas" component={Descargas} />
          <Stack.Screen name="TableroVendedor" component={TableroVendedor} />
          <Stack.Screen name="Facturas" component={Facturas} />
          <Stack.Screen name="Pedidos" component={Pedidos} />
          <Stack.Screen name="EditUser" component={EditUser} />
          <Stack.Screen name="ListadoClientes" component={ListadoClientes}/>
          <Stack.Screen name="FacturasVendedor" component={FacturasVendedor} />
          <Stack.Screen name="AdminPanel" component={AdminPanel}/>
          <Stack.Screen name="GestionUsuarios" component={GestionUsuarios}/>
          <Stack.Screen name="AdminPromociones" component={AdminPromociones}/>
          <Stack.Screen name="AdminNuevaPromo" component={AdminNuevaPromo}/>
          <Stack.Screen name="DashboardAdministrador" component={DashboardAdministrador}/>
          <Stack.Screen name="AdminBanners" component={AdminBanners}/>
          <Stack.Screen name="AdminPlazos" component={AdminPlazos}/>
        </Stack.Navigator>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    position: 'relative',
  },
  headerRightIcons: {
    position: 'absolute',
    right: 40,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F2F2F2',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: '#FF4D4D',
    paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  headerAvatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2B2B2B',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  loginPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 40, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1, borderColor: '#1C9BD8', backgroundColor: '#FFFFFF',
  },
  loginPillText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#1C9BD8', letterSpacing: 0.3 },
  headerLeftInfo: {
    position: 'absolute', top: 0, bottom: 0,
    justifyContent: 'center',
  },
  tcLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10, color: '#9CA3AF', letterSpacing: 0.5 },
  tcValue: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B', marginTop: 1 },
});

export default AppNavigator;