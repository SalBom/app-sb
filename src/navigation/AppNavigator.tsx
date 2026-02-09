// src/navigation/AppNavigator.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getUserRoleFromStorage } from '../utils/authStorage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
// 1. ELIMINAR IMPORTACIÓN DE FAVORITOS AQUÍ
// import Favoritos from '../screens/Favoritos'; 

const Stack = createNativeStackNavigator<RootStackParamList>();

// Header global con logo centrado
const SalBomHeader = () => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
      <Logo width={220} height={80} /> 
    </View>
  );
};

const AppNavigator = () => {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      const role = await getUserRoleFromStorage();
      setUserRole(role || '');
      setLoading(false);
    };

    fetchUserRole();
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />; 
  }

  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        header: () => <SalBomHeader />, 
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
  },
});

export default AppNavigator;