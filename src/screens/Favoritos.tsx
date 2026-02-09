// src/screens/Favoritos.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import Svg, { Path, Rect } from 'react-native-svg';

import authStorage from '../utils/authStorage';
import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/useFavoritesStore';

import TarjetaProductoListado from '../components/TarjetaProductoListado';
import TarjetaProductoKanban from '../components/TarjetaProductoKanban';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';

// Iconos de Vista
const IconGrid = () => ( <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B2B2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Rect x="3" y="3" width="7" height="7" /><Rect x="14" y="3" width="7" height="7" /><Rect x="14" y="14" width="7" height="7" /><Rect x="3" y="14" width="7" height="7" /></Svg> );
const IconList = () => ( <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B2B2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M8 6h13" /><Path d="M8 12h13" /><Path d="M8 18h13" /><Path d="M3 6h.01" /><Path d="M3 12h.01" /><Path d="M3 18h.01" /></Svg> );

import { API_URL } from '../config';
const HEADER_PAD = 12;

export default function Favoritos() {
  const navigation = useNavigation<any>();
  // 1. Ya no usamos insets para el padding superior para eliminar el espacio blanco
  
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const addToCart = useCartStore((s) => s.addToCart);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const itemsInCart = useCartStore((s) => s.items);
  
  const favorites = useFavoritesStore((state) => state.favorites);
  const removeFavorite = useFavoritesStore((state) => state.removeFavorite);
  const addFavorite = useFavoritesStore((state) => state.addFavorite);

  const fetchFavoritos = async () => {
    try {
      const cuit = await authStorage.getCuitFromStorage();
      if (!cuit) return;
      const res = await axios.get(`${API_URL}/favoritos?cuit=${cuit}`);
      setProductos(res.data.items || []);
    } catch (e) {
      console.log('Error fetching favorites', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFavoritos();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchFavoritos();
  };

  const handleToggleFavorito = async (item: any) => {
    setProductos(prev => prev.filter(p => p.id !== item.id));
    removeFavorite(item.id);
    try {
      const cuit = await authStorage.getCuitFromStorage();
      await axios.post(`${API_URL}/favoritos/toggle`, { cuit, product_id: item.id });
    } catch (e) {}
  };

  const handlePressAgregar = (item: any, quantity: number) => {
    const existing = itemsInCart.find(it => it.product_id === item.id);
    const finalPrice = (item.price_offer && item.price_offer > 0) ? item.price_offer : item.list_price;
    if (existing) {
        updateQuantity(item.id, existing.product_uom_qty + quantity);
    } else if (quantity > 0) {
        addToCart({
            product_id: item.id, name: item.name, price_unit: finalPrice, list_price: item.list_price, 
            product_uom_qty: quantity, default_code: item.default_code || '', 
            image_md_url: item.image_md_url, image_thumb_url: item.image_thumb_url,
        });
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isFav = true; 
    if (viewMode === 'kanban') {
      const width = (Dimensions.get('window').width - (HEADER_PAD * 2) - 12) / 2; 
      return (
        <TarjetaProductoKanban 
          producto={item} isFavorite={isFav}
          onPressDetalle={() => navigation.navigate('ProductoDetalle', { id: item.id, preload: item })}
          onPressAgregar={(q) => handlePressAgregar(item, q)}
          onToggleFavorito={() => handleToggleFavorito(item)}
          width={width}
        />
      );
    }
    return (
      <TarjetaProductoListado 
        producto={item} isFavorite={isFav}
        onPressDetalle={() => navigation.navigate('ProductoDetalle', { id: item.id, preload: item })}
        onPressAgregar={(q) => handlePressAgregar(item, q)}
        onToggleFavorito={() => handleToggleFavorito(item)}
      />
    );
  };

  // 2. Se eliminó paddingTop: insets.top del contenedor principal
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
                {/* 3. Padding izquierdo removido en estilos para pegar la flecha */}
                <FlechaHeaderSvg width={60} height={36} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>MIS FAVORITOS</Text>
        </View>
        <TouchableOpacity onPress={() => setViewMode(prev => prev === 'list' ? 'kanban' : 'list')} style={styles.viewToggleBtn}>
            {viewMode === 'list' ? <IconGrid /> : <IconList />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1C9BD8" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={productos}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent, 
            viewMode === 'list' ? { paddingHorizontal: 0 } : { paddingHorizontal: HEADER_PAD }
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          key={viewMode}
          numColumns={viewMode === 'kanban' ? 2 : 1}
          columnWrapperStyle={viewMode === 'kanban' ? { justifyContent: 'space-between' } : undefined}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Aún no tenés productos favoritos.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 10 }, // Padding fijo mínimo
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingRight: 16, 
    paddingLeft: 0,   // Flecha pegada a la izquierda
    marginBottom: 6, 
    marginTop: 0, 
  },
  headerTitle: { 
    marginLeft: 8, 
    fontSize: 28, 
    letterSpacing: 0.6, 
    color: '#2B2B2B', 
    fontFamily: 'BarlowCondensed-Bold' 
  },
  viewToggleBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 8 },
  listContent: { paddingBottom: 80, paddingTop: 10 }, // Más padding bottom para no tapar con la barra
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontFamily: 'BarlowCondensed-Regular', fontSize: 18, color: '#999' }
});