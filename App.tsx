import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import linking from './src/navigation/linking';
import { RootStackParamList } from './src/types/navigation';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen'; // <-- Nuevo import
import axios from 'axios';
import { useCartStore } from './src/store/cartStore';
import { getCuitFromStorage } from './src/utils/authStorage';
import { API_URL } from './src/config';
import { cargarMasterbox } from './src/config/masterbox';
import ErrorBoundary from './src/components/ErrorBoundary';

// Mantiene visible la pantalla de carga (splash screen) hasta que digamos lo contrario
SplashScreen.preventAutoHideAsync();

// Ref global de navegación: la usa el sidebar de escritorio (que vive AFUERA del
// Stack.Navigator, como hermano, para no quedar atrapado en el stacking context
// que arma react-navigation para las transiciones animadas de cada pantalla).
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    Rubik: require('./assets/fonts/Rubik.ttf'),
    'BarlowCondensed-Bold': require('./assets/fonts/BarlowCondensed-Bold.ttf'),
    'BarlowCondensed-Regular': require('./assets/fonts/BarlowCondensed-Regular.ttf'),
    'BarlowCondensed-Light': require('./assets/fonts/BarlowCondensed-Light.ttf'),
    'BarlowCondensed-SemiBold': require('./assets/fonts/BarlowCondensed-SemiBold.ttf'),
  });

  const setItems = useCartStore((state: any) => state.setItems);

  useEffect(() => {
    const syncCartOnLaunch = async () => {
      try {
        const cuit = await getCuitFromStorage();
        if (cuit) {
          const res = await axios.get(`${API_URL}/cart/load`, { params: { cuit } });
          if (res.data && Array.isArray(res.data.items)) {
            setItems(res.data.items);
          }
        }
      } catch (error) {
        // Fallo silencioso al inicio
      }
    };

    syncCartOnLaunch();
    // Carga la config de masterbox (SKU → unidades por caja) desde el backend.
    cargarMasterbox();
  }, []);

  // Oculta el splash screen una vez que las fuentes terminan de cargar
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // En lugar de renderizar <AppLoading />, retornamos null
  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      {/* Cualquier error de render queda contenido acá: el usuario ve un aviso
          con el detalle en vez de una pantalla en blanco. */}
      <ErrorBoundary>
        <NavigationContainer<RootStackParamList> ref={navigationRef} linking={linking}>
          <AppNavigator />
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
