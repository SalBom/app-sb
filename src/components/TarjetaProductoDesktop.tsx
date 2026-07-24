import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';

import IsseiIsologo from '../../assets/isseiIsologo.svg';
import ShimuraIsologo from '../../assets/shimuraIsologo.svg';
import StockSemaphore from './StockSemaphore';
import useIsGuest from '../hooks/useIsGuest';
import { contactarPorWhatsApp } from '../utils/whatsapp';

function needsAltMedia(u: string | null | undefined) {
  if (!u) return false;
  const lower = u.toLowerCase();
  const isFb = lower.includes('firebasestorage.googleapis.com') || lower.includes('appspot.com');
  const hasAlt = /\balt=media\b/.test(lower);
  return isFb && !hasAlt;
}
function withAltMedia(u?: string | null): string | null {
  if (!u) return null;
  if (!needsAltMedia(u)) return u;
  return u.includes('?') ? `${u}&alt=media` : `${u}?alt=media`;
}

export interface ProductoDesktop {
  id: number;
  name: string;
  list_price: number;
  price_offer?: number | null;
  image_128?: string | null;
  default_code?: string | null;
  marca?: string | [number, string] | null;
  marca_name?: string | null;
  brand?: string | [number, string] | null;
  image_thumb_url?: string | null;
  image_md_url?: string | null;
  stock_state?: string;
}

interface Props {
  producto: ProductoDesktop;
  isFavorite: boolean;
  onPressDetalle: () => void;
  onPressAgregar: (quantity: number, event?: any) => void;
  onToggleFavorito: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, n || 0));

// Card de producto para el catálogo desktop — calcada del Figma "Productos - 4":
// badge de marca arriba a la izquierda, favorito/carrito/detalle a la derecha,
// imagen centrada, sku + nombre + precio abajo. Mobile usa TarjetaProductoListado,
// esta card es exclusiva de la versión desktop.
const TarjetaProductoDesktop: React.FC<Props> = ({ producto, isFavorite, onPressDetalle, onPressAgregar, onToggleFavorito }) => {
  const isGuest = useIsGuest();
  const imageSource = useMemo(() => {
    const md = withAltMedia(producto.image_md_url);
    if (md) return { uri: md };
    const th = withAltMedia(producto.image_thumb_url);
    if (th) return { uri: th };
    if (producto.image_128) {
      const b64 = producto.image_128.startsWith('data:') ? producto.image_128 : `data:image/png;base64,${producto.image_128}`;
      return { uri: b64 };
    }
    return null;
  }, [producto.image_md_url, producto.image_thumb_url, producto.image_128]);

  const getBrandString = () => {
    const raw = producto.marca_name || producto.brand || producto.marca;
    if (Array.isArray(raw) && raw.length > 1) return String(raw[1]);
    if (typeof raw === 'string') return raw;
    return '';
  };
  const brandName = getBrandString();
  const isIssei = /issei/i.test(brandName);
  const isShimura = /shimura/i.test(brandName);
  // El invitado no ve precios de oferta: siempre precio de lista.
  const hasOffer = !isGuest && producto.price_offer !== undefined && producto.price_offer !== null && producto.price_offer < producto.list_price;
  const finalPrice = hasOffer ? (producto.price_offer as number) : producto.list_price;

  return (
    <Pressable style={styles.card} onPress={onPressDetalle}>
      {(isShimura || isIssei) && (
        <View style={styles.badgeWrap}>
          {isShimura ? <ShimuraIsologo width={44} height={43} /> : <IsseiIsologo width={44} height={43} />}
        </View>
      )}

      <View style={styles.actionsCol}>
        {isGuest ? (
          // Invitado: en vez de favorito/carrito, contacto directo por WhatsApp.
          <TouchableOpacity style={styles.iconCircle} onPress={() => contactarPorWhatsApp(producto)} hitSlop={6}>
            <Feather name="message-circle" size={16} color="#25D366" />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.iconCircle} onPress={onToggleFavorito} hitSlop={6}>
              <Feather name="heart" size={16} color="#1C9BD8" style={isFavorite ? { opacity: 1 } : { opacity: 0.5 }} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconCircle} onPress={(e) => onPressAgregar(1, e)} hitSlop={6}>
              <Feather name="shopping-cart" size={15} color="#1C9BD8" />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={styles.iconCircle} onPress={onPressDetalle} hitSlop={6}>
          <Feather name="eye" size={16} color="#1C9BD8" />
        </TouchableOpacity>
      </View>

      <View style={styles.imgWrap}>
        {imageSource ? (
          <Image source={imageSource} style={styles.img} contentFit="contain" transition={150} cachePolicy="memory-disk" />
        ) : (
          <View style={styles.imgPlaceholder} />
        )}
      </View>

      <View style={styles.skuRow}>
        <Text style={styles.sku} numberOfLines={1}>{producto.default_code || ''}</Text>
        {!isGuest && <StockSemaphore status={producto.stock_state} size={10} style={{ marginLeft: 6 }} />}
      </View>
      <Text style={styles.name} numberOfLines={2}>{(producto.name || '').toUpperCase()}</Text>
      {hasOffer ? (
        <View style={styles.priceRow}>
          <Text style={styles.priceStriked}>${fmt(producto.list_price)}</Text>
          <Text style={styles.priceOffer}>${fmt(finalPrice)}</Text>
          <View style={styles.offerBadge}><Text style={styles.offerBadgeText}>OFERTA</Text></View>
        </View>
      ) : (
        <Text style={styles.price}>${fmt(finalPrice)}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 16,
    paddingTop: 14,
    overflow: 'hidden',
  },
  // Pegado al borde real de la card (top:0/left:0 se posiciona respecto al
  // padding-box del ancestro, ignorando el padding interno de la card).
  badgeWrap: { position: 'absolute', top: 0, left: 0, zIndex: 2 },
  actionsCol: { position: 'absolute', top: 12, right: 12, zIndex: 2, gap: 8 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EDEDED', alignItems: 'center', justifyContent: 'center' },
  imgWrap: { width: '100%', height: 190, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  img: { width: '88%', height: '88%' },
  imgPlaceholder: { width: '100%', height: '100%', backgroundColor: '#F5F5F5', borderRadius: 8 },
  skuRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  sku: { fontFamily: 'BarlowCondensed-Regular', fontSize: 11, color: '#8A8A8A' },
  name: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, lineHeight: 16, color: '#313131', marginTop: 2, minHeight: 32 },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  priceStriked: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#9CA3AF', textDecorationLine: 'line-through' },
  priceOffer: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#D32F2F' },
  offerBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' },
  offerBadgeText: { color: '#D32F2F', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 },
  price: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#313131', marginTop: 6 },
});

export default TarjetaProductoDesktop;
