// src/components/TarjetaProductoCatalogo.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductoBase } from '../store/cartStore';
import { useImagenStore } from '../store/useImagenStore';

type Variant = 'grid' | 'carousel';

interface Props {
  producto: ProductoBase & {
    id: number;
    list_price: number;
    image_128?: string;
    // NUEVO: URLs opcionales provistas por backend
    image_thumb_url?: string | null;
    image_md_url?: string | null;
  };
  isFavorite: boolean;
  onToggleFavorito: () => void;
  onPressDetalle: () => void;
  onPressAgregar: () => void;
  variant?: Variant;       // grid (default) | carousel
  cardWidth?: number;      // solo para carousel
}

// === Layout helpers ===
const SCREEN_W = Dimensions.get('window').width;
const H_PADDING = 16 * 2;
const GRID_GAP = 12;
const GRID_COLS = 2;
const GRID_ITEM_W = Math.floor((SCREEN_W - H_PADDING - GRID_GAP) / GRID_COLS);

const TarjetaProductoCatalogo: React.FC<Props> = ({
  producto,
  isFavorite,
  onToggleFavorito,
  onPressDetalle,
  onPressAgregar,
  variant = 'grid',
  cardWidth,
}) => {
  const imagenCacheada = useImagenStore((s) => s.imagenes[producto.id]);
  const setImagen = useImagenStore((s) => s.setImagen);

  const [loadingImg, setLoadingImg] = useState(false);
  const [hadError, setHadError] = useState(false);
  const requestedRef = useRef(false);

  // NUEVO: si hay URL, no buscamos base64
  const hasUrl = !!(producto.image_md_url || producto.image_thumb_url);

  const imagenFinal = useMemo(() => {
    return producto.image_128 || imagenCacheada || null;
  }, [producto.image_128, imagenCacheada]);

  useEffect(() => {
    let cancelled = false;
    if (hasUrl) return; // <<--- agregado: con URL no fetch
    if (imagenFinal) return;
    if (requestedRef.current) return;
    requestedRef.current = true;

    const fetchImagen = async () => {
      try {
        setLoadingImg(true);
        setHadError(false);
        const res = await fetch(`https://app-sb-production.up.railway.app/producto/${producto.id}/imagen`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && data?.image_128) setImagen(producto.id, data.image_128);
      } catch (e) {
        if (!cancelled) setHadError(true);
        console.warn('❌ Error cargando imagen de producto', producto.id, e);
      } finally {
        if (!cancelled) setLoadingImg(false);
      }
    };

    fetchImagen();
    return () => { cancelled = true; };
  }, [producto.id, imagenFinal, setImagen, hasUrl]);

  const cardDynamic: ViewStyle = useMemo(() => {
    if (variant === 'carousel') {
      return { width: cardWidth ?? 190, marginRight: 12, marginVertical: 6 };
    }
    return { width: GRID_ITEM_W, marginHorizontal: 6, marginVertical: 6 };
  }, [variant, cardWidth]);

  return (
    <TouchableOpacity style={[styles.cardBase, cardDynamic]} onPress={onPressDetalle} activeOpacity={0.9}>
      {/* Favorito */}
      <TouchableOpacity style={styles.favIcon} onPress={onToggleFavorito}>
        <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={20} color={isFavorite ? '#FFD700' : '#555'} />
      </TouchableOpacity>

      {/* Imagen */}
      <View style={styles.imageWrapper}>
        {hasUrl ? (
          <Image
            source={{ uri: producto.image_md_url || producto.image_thumb_url || '' }}
            style={styles.image}
            resizeMode="contain"
            onError={() => setHadError(true)}
          />
        ) : imagenFinal ? (
          <Image
            source={{ uri: `data:image/png;base64,${imagenFinal}` }}
            style={styles.image}
            resizeMode="contain"
            onError={() => setHadError(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            {hadError ? <Ionicons name="image-outline" size={22} color="#999" /> : <ActivityIndicator size="small" color="#999" />}
          </View>
        )}
      </View>

      {/* Título + precio */}
      <Text style={styles.title} numberOfLines={2}>{producto.name}</Text>
      <Text style={styles.price}>USD {producto.list_price}</Text>

      {/* Acciones */}
      <View style={styles.iconRow}>
        <TouchableOpacity onPress={onPressAgregar}>
          <Ionicons name="cart-outline" size={22} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => console.log('Comparar', producto.id)}>
          <Ionicons name="git-compare-outline" size={22} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardBase: {
    backgroundColor: '#fff', borderRadius: 12, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
    position: 'relative',
  },
  favIcon: { position: 'absolute', top: 6, right: 6, zIndex: 1 },
  imageWrapper: { width: '100%', height: 110, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  image: { width: '100%', height: 110, borderRadius: 8, backgroundColor: '#fff' },
  imagePlaceholder: { width: '100%', height: 110, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eee', borderRadius: 8 },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4, color: '#333' },
  price: { fontSize: 13, color: '#009cde', marginBottom: 8 },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
});

export default React.memo(TarjetaProductoCatalogo);
