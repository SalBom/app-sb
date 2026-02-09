import 'react-native-gesture-handler';
import React, { useEffect } from 'react'; 
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import AppLoading from 'expo-app-loading';
import { useFonts } from 'expo-font';
import axios from 'axios'; 
import { useCartStore } from './src/store/cartStore';
import { getCuitFromStorage } from './src/utils/authStorage';
import { API_URL } from './src/config'; 

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
            // console.log("Carrito sincronizado"); // LIMPIEZA
          }
        }
      } catch (error) {
        // Fallo silencioso al inicio
      }
    };

    syncCartOnLaunch();
  }, []);

  if (!fontsLoaded) {
    return <AppLoading />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}