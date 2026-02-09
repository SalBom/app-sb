import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type MenuScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Menu'>;

const Menu: React.FC = () => {
  const navigation = useNavigation<MenuScreenNavigationProp>();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('MainTabs')}
      >
        <Text style={styles.buttonText}>Armar Pedido</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('MainTabs')}
      >
        <Text style={styles.buttonText}>Estado de Cuenta</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('MainTabs')}
      >
        <Text style={styles.buttonText}>Carrito</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('MainTabs')}
      >
        <Text style={styles.buttonText}>Mis Ventas</Text>
      </TouchableOpacity>

      {/* 🔵 Nuevo botón para ir al Dashboard del Vendedor */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#009cde' }]}
        onPress={() => navigation.navigate('DashboardVendedor')}
      >
        <Text style={styles.buttonText}>Dashboard Vendedor</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#dc3545' }]}
        onPress={() => navigation.replace('Login')}
      >
        <Text style={styles.buttonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 15,
    marginVertical: 5,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default Menu;
