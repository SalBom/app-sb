import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons'; 

import { useCartStore } from '../store/cartStore';
import StockSemaphore from './StockSemaphore'; 

// ICONOS
import CartIcon from '../../assets/cartIcon.svg';
// FavIcon eliminado
import IsseiRibbon from '../../assets/isseiLogoMarca.svg';
import ShimuraRibbon from '../../assets/ShimuraLogoMarca.svg';

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
}

const SCREEN_W = Dimensions.get('window').width;
const OUTER_SIDE_PAD = 16;
const CARD_ASPECT_RATIO = 993 / 460; 

const PAD = { top: 16, right: 16, bottom: 16, left: 16 };
const IMG_W_PCT = 0.40; 
const CUT_SIZE = 30;

const CARD_WIDTH = SCREEN_W - OUTER_SIDE_PAD * 2;
const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT_RATIO);
const SHADOW_OFFSET = 5;
const BLUR_RADIUS = 3;
const SVG_PADDING = BLUR_RADIUS * 3;

export const ITEM_HEIGHT = CARD_HEIGHT + SHADOW_OFFSET + SVG_PADDING + 12; 

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n || 0)));

const toUpper = (s?: string | null) => (s ? String(s).toUpperCase() : '');

const truncateText = (text: string, limit: number) => {
  if (!text) return '';
  return text.length > limit ? text.substring(0, limit) + '...' : text;
};

const BLURHASH = 'L5H2EC=PM{yV0g-mq.wG9c010J}I';

const TarjetaProductoListado: React.FC<Props> = ({
  producto,
  isFavorite,
  onPressDetalle,
  onPressAgregar,
  onToggleFavorito,
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

  const handleAddToCartClick = () => {
    if (!showQtySelector) {
        onPressAgregar(1);
    } else {
        handleIncrement();
    }
  };

  const handleIncrement = () => onPressAgregar(1);
  const handleDecrement = () => onPressAgregar(-1);

  const pathData = `
    M 0,0 
    H ${CARD_WIDTH - CUT_SIZE} 
    L ${CARD_WIDTH},${CUT_SIZE} 
    V ${CARD_HEIGHT - CUT_SIZE} 
    L ${CARD_WIDTH - CUT_SIZE},${CARD_HEIGHT} 
    H 0 
    V 0 
    Z
  `;

  return (
    <Pressable 
      onPress={onPressDetalle} 
      style={({ pressed }) => [
        styles.cardContainer, 
        { width: CARD_WIDTH, height: CARD_HEIGHT + SHADOW_OFFSET + SVG_PADDING, marginHorizontal: OUTER_SIDE_PAD, opacity: pressed ? 0.99 : 1, marginBottom: 12 }
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { top: -SVG_PADDING, left: -SVG_PADDING, right: -SVG_PADDING }]}>
        <Svg width={CARD_WIDTH + SVG_PADDING * 2} height={CARD_HEIGHT + SHADOW_OFFSET + SVG_PADDING * 2}>
          <Defs>
            <Filter id="shadowBlur" x="-50%" y="-50%" width="200%" height="200%">
              <FeGaussianBlur in="SourceGraphic" stdDeviation={BLUR_RADIUS} />
            </Filter>
          </Defs>
          <G transform={`translate(${SVG_PADDING}, ${SVG_PADDING})`}>
            <Path d={pathData} fill="#000000" opacity={0.12} transform={`translate(0, ${SHADOW_OFFSET})`} filter="url(#shadowBlur)"/>
            <Path d={pathData} fill="#FFFFFF" stroke="rgba(0,0,0,0.05)" strokeWidth={0.5}/>
          </G>
        </Svg>
      </View>

      <View style={{ height: CARD_HEIGHT, width: CARD_WIDTH }}>
        {(isIssei || isShimura) && (
          <View style={styles.ribbonWrap} pointerEvents="none">
            {isIssei ? <IsseiRibbon width="100%" height="100%" /> : <ShimuraRibbon width="100%" height="100%" />}
          </View>
        )}

        <View style={[styles.inner, { padding: PAD.top, paddingLeft: PAD.left, paddingRight: PAD.right, paddingBottom: PAD.bottom }]}>
          <View style={styles.row}>
            
            <View style={styles.imageContainer}>
              {imageSource ? (
                <Image
                  source={imageSource}
                  style={styles.img}
                  contentFit="contain"
                  transition={200}
                  cachePolicy="memory-disk"
                  placeholder={BLURHASH}
                />
              ) : (
                <View style={styles.imgPlaceholder}>
                  <Text style={styles.placeholderText}>Sin imagen</Text>
                </View>
              )}
            </View>

            <View style={styles.rightCol}>
              <Text style={styles.cuotas}>PRECIO DE LISTA</Text>

              <View style={{ marginBottom: hasOffer ? 0 : 4 }}>
                {hasOffer ? (
                    <View style={styles.priceRow}>
                        <Text style={styles.priceOld}>$ {fmt(Number(producto.list_price || 0))}</Text>
                        <Text style={styles.priceOffer}>$ {fmt(Number(producto.price_offer || 0))}</Text>
                        <View style={styles.offerBadgeInline}>
                            <Text style={styles.offerText}>OFERTA</Text>
                        </View>
                    </View>
                ) : (
                    <Text numberOfLines={1} style={styles.price}>$ {fmt(Number(producto.list_price || 0))}</Text>
                )}
              </View>

              <Text numberOfLines={1} style={styles.title}>
                {truncateText(toUpper(producto.name), 20)}
              </Text>
              
              <View style={styles.codeRow}>
                  {!!producto.default_code && (
                      <Text style={styles.code}>{toUpper(producto.default_code)}</Text>
                  )}
                  <StockSemaphore status={producto.stock_state} style={{ marginLeft: 8 }} />
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.cartCircleBtn} onPress={handleAddToCartClick} activeOpacity={0.8}>
                    <CartIcon width={16} height={16} color="#1C9BD8" /> 
                </TouchableOpacity>

                {/* BOTÓN FAVORITO ACTUALIZADO */}
                <TouchableOpacity style={styles.favCircleBtn} onPress={onToggleFavorito} activeOpacity={0.8}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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

                {showQtySelector && (
                    <View style={styles.qtyPill}>
                        <TouchableOpacity onPress={handleDecrement} style={styles.qtyBtn} hitSlop={5}>
                            <Feather name="minus" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{displayQty}</Text>
                        <TouchableOpacity onPress={handleIncrement} style={styles.qtyBtn} hitSlop={5}>
                            <Feather name="plus" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                )}
              </View>

            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cardContainer: { backgroundColor: 'transparent', overflow: 'visible' },
  inner: { flex: 1 },
  row: { flexDirection: 'row', flex: 1 },
  ribbonWrap: { position: 'absolute', top: 0, left: -13, zIndex: 2, width: 130, height: 36 },
  offerBadgeInline: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA', marginLeft: 8, alignSelf: 'center' },
  offerText: { color: '#D32F2F', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 },
  imageContainer: { width: `${IMG_W_PCT * 100}%`, height: '100%', alignItems: 'center', justifyContent: 'center', padding: 8 },
  img: { width: '100%', height: '100%', transform: [{ translateY: 15 }] }, 
  imgPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', borderRadius: 12 },
  placeholderText: { color: '#9CA3AF', fontSize: 11, fontFamily: 'BarlowCondensed-Regular' },
  rightCol: { flex: 1, paddingLeft: 12, justifyContent: 'flex-start', minWidth: 0 },
  cuotas: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.4, color: '#1F2937', marginBottom: 2 },
  price: { fontFamily: 'BarlowCondensed-Bold', fontSize: 38, lineHeight: 38, color: '#2B2B2B', letterSpacing: -1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' }, 
  priceOld: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#9CA3AF', textDecorationLine: 'line-through', marginRight: 8, marginBottom: 0 },
  priceOffer: { fontFamily: 'BarlowCondensed-Bold', fontSize: 38, lineHeight: 38, color: '#D32F2F', letterSpacing: -1 },
  title: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#1F2937', textTransform: 'uppercase', lineHeight: 20, marginBottom: 2 },
  
  codeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  code: { fontFamily: 'BarlowCondensed-Regular', fontSize: 14, color: '#6B7280' },

  actionsRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, width: '100%' },
  cartCircleBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  favCircleBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  qtyPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C9BD8', borderRadius: 17, height: 34, paddingHorizontal: 6, minWidth: 80, justifyContent: 'space-between' },
  qtyBtn: { width: 26, height: '100%', alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', marginHorizontal: 2, marginTop: -2 }
});

export default React.memo(TarjetaProductoListado);