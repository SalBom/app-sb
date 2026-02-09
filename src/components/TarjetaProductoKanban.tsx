import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image'; 
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons'; 

import { useCartStore } from '../store/cartStore';
import StockSemaphore from './StockSemaphore'; 

// ICONOS
import CartIcon from '../../assets/cartIcon.svg';
// FavIcon eliminado, usamos SVG inline
import IsseiRibbon from '../../assets/isseiLogoMarca.svg';
import ShimuraRibbon from '../../assets/ShimuraLogoMarca.svg';

// --- LÓGICA DE IMAGEN FIREBASE ---
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

export interface ProductoListado {
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
  producto: ProductoListado;
  isFavorite: boolean;
  onPressDetalle: () => void;
  onPressAgregar: (quantity: number) => void;
  onToggleFavorito: () => void;
  width: number; 
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n || 0)));

const CUT_SIZE = 20;      
const SHADOW_OFFSET = 4;  
const BLUR_RADIUS = 3;    
const SVG_PADDING = 10;   
const CARD_HEIGHT = 270; 

const TarjetaProductoKanban: React.FC<Props> = ({
  producto,
  isFavorite,
  onPressDetalle,
  onPressAgregar,
  onToggleFavorito,
  width
}) => {
  const items = useCartStore(state => state.items);
  const cartItem = items.find(i => i.product_id === producto.id);
  
  const qtyInCart = cartItem ? cartItem.product_uom_qty : 0;
  const showQtySelector = qtyInCart > 0;
  const displayQty = qtyInCart > 0 ? qtyInCart : 1;

  const imageSource = useMemo(() => {
      const md = withAltMedia(producto.image_md_url);
      if (md) return { uri: md };
      const th = withAltMedia(producto.image_thumb_url);
      if (th) return { uri: th };
      if (producto.image_128) {
          const b64 = producto.image_128.startsWith('data:') 
              ? producto.image_128 
              : `data:image/png;base64,${producto.image_128}`;
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
  
  const hasOffer = (producto.price_offer !== undefined && producto.price_offer !== null && producto.price_offer < producto.list_price);
  const displayPrice = hasOffer ? producto.price_offer : producto.list_price;

  const handleAddToCartClick = () => {
    onPressAgregar(1);
  };

  const handleIncrement = () => onPressAgregar(1);
  const handleDecrement = () => onPressAgregar(-1);

  const pathData = `
    M 0,0 
    H ${width - CUT_SIZE} 
    L ${width},${CUT_SIZE} 
    V ${CARD_HEIGHT - CUT_SIZE} 
    L ${width - CUT_SIZE},${CARD_HEIGHT} 
    H 0 
    Z
  `;

  return (
    <Pressable 
      onPress={onPressDetalle}
      style={({ pressed }) => [
        styles.container,
        { width: width, height: CARD_HEIGHT + SVG_PADDING, opacity: pressed ? 0.96 : 1 }
      ]}
    >
      <View style={StyleSheet.absoluteFill}>
        <Svg width={width + SVG_PADDING * 2} height={CARD_HEIGHT + SHADOW_OFFSET + SVG_PADDING * 2} style={{ marginLeft: -SVG_PADDING, marginTop: -SVG_PADDING }}>
          <Defs>
            <Filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <FeGaussianBlur in="SourceAlpha" stdDeviation={BLUR_RADIUS} />
            </Filter>
          </Defs>
          <G transform={`translate(${SVG_PADDING}, ${SVG_PADDING})`}>
            <Path d={pathData} fill="#000" opacity={0.10} transform={`translate(0, ${SHADOW_OFFSET})`} filter="url(#shadow)" />
            <Path d={pathData} fill="#FFFFFF" />
            <Path d={pathData} stroke="#F3F4F6" strokeWidth={1} fill="none" />
          </G>
        </Svg>
      </View>

      {(isIssei || isShimura) && (
        <View style={styles.ribbonWrap}>
          {isIssei ? <IsseiRibbon width="100%" height="100%" /> : <ShimuraRibbon width="100%" height="100%" />}
        </View>
      )}

      <View style={{ width: width, height: CARD_HEIGHT, padding: 10 }}>
        
        <View style={styles.imageContainer}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={styles.img}
              contentFit="contain"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={styles.imgPlaceholder}>
              <Text style={styles.placeholderText}>Sin imagen</Text>
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          
          <View style={{ marginBottom: 2 }}>
            {hasOffer ? (
                <View>
                    <View style={styles.offerRowTop}>
                        <Text style={styles.priceOld}>$ {fmt(Number(producto.list_price || 0))}</Text>
                        <View style={styles.offerBadge}>
                            <Text style={styles.offerText}>OFERTA</Text>
                        </View>
                    </View>
                    <Text style={[styles.price, styles.priceRed]} numberOfLines={1}>
                        $ {fmt(Number(displayPrice))}
                    </Text>
                </View>
            ) : (
                <Text style={styles.price} numberOfLines={1}>
                    $ {fmt(Number(displayPrice))}
                </Text>
            )}
          </View>

          <Text numberOfLines={2} style={styles.title}>
            {producto.name.toUpperCase()}
          </Text>

          <View style={styles.codeRow}>
              {!!producto.default_code && (
                <Text style={styles.code}>{producto.default_code}</Text>
              )}
              <StockSemaphore status={producto.stock_state} style={{ marginLeft: 6 }} />
          </View>

          <View style={styles.actionsRow}>
            {showQtySelector && (
              <View style={styles.qtyPill}>
                  <TouchableOpacity onPress={handleDecrement} style={styles.qtyBtn} hitSlop={5}>
                      <Feather name="minus" size={10} color="#FFFFFF" />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{displayQty}</Text>
                  <TouchableOpacity onPress={handleIncrement} style={styles.qtyBtn} hitSlop={5}>
                      <Feather name="plus" size={10} color="#FFFFFF" />
                  </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.circleBtn} onPress={handleAddToCartClick} activeOpacity={0.8}>
               <CartIcon width={18} height={18} color="#1C9BD8" />
            </TouchableOpacity>

            {/* BOTÓN FAVORITO ACTUALIZADO (ESTILO CORAZÓN AZUL) */}
            <TouchableOpacity style={styles.circleBtn} onPress={onToggleFavorito} activeOpacity={0.8}>
               <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    fill={isFavorite ? "#1C9BD8" : "none"}
                    stroke="#1C9BD8"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
               </Svg>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 6 },
  ribbonWrap: { position: 'absolute', top: 0, left: -12, width: 110, height: 30, zIndex: 10 },
  imageContainer: { width: '100%', height: 100, alignItems: 'center', justifyContent: 'center', marginTop: 28, paddingRight: 16, marginBottom: 2 },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { width: '100%', height: '100%', backgroundColor: '#F9FAFB', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#9CA3AF', fontSize: 10, fontFamily: 'BarlowCondensed-Regular' },
  
  infoContainer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 4 },
  
  price: { fontFamily: 'BarlowCondensed-Bold', fontSize: 28, color: '#2B2B2B', lineHeight: 28 },
  priceRed: { color: '#D32F2F' },
  offerRowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  priceOld: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#9CA3AF', textDecorationLine: 'line-through', marginRight: 6 },
  offerBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 4, paddingVertical: 0, borderRadius: 4, borderWidth: 1, borderColor: '#FECACA' },
  offerText: { color: '#D32F2F', fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5 },

  title: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#1F2937', lineHeight: 16, marginBottom: 0, marginTop: 4 },
  
  codeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 0, marginBottom: 6 },
  code: { fontFamily: 'BarlowCondensed-Regular', fontSize: 12, color: '#6B7280' },
  
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 8, gap: 8, alignItems: 'center' },
  circleBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  qtyPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C9BD8', borderRadius: 14, height: 28, paddingHorizontal: 2, minWidth: 60, justifyContent: 'space-between', marginRight: 0 },
  qtyBtn: { width: 20, height: '100%', alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF', marginHorizontal: 1, marginTop: -1 }
});

export default React.memo(TarjetaProductoKanban);