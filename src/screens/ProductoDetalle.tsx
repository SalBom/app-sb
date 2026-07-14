import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  Dimensions,
  Animated,
  FlatList,
  Modal,
  Pressable,
  Platform
} from 'react-native';
import { Image } from 'expo-image'; 
import { useRoute, useNavigation } from '@react-navigation/native';
import axios from 'axios';
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';
import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy'; 
import * as MediaLibrary from 'expo-media-library'; 

// AUTH PARA VERIFICAR ROL
import { getCuitFromStorage } from '../utils/authStorage';

// COMPONENTE SEMÁFORO
import StockSemaphore from '../components/StockSemaphore';

// SVGs existentes
import AgregarCarritoSvg from '../../assets/agregarCarrito.svg';
import ContenedorQtySvg  from '../../assets/contenedorCantidad.svg';
import MasSvg            from '../../assets/masCantidad.svg';
import MenosSvg          from '../../assets/menosCantidad.svg';

// SVGs nuevos
import FlechaAzulSvg       from '../../assets/flechaAzul.svg';
import FlechaNegraSvg      from '../../assets/flechaNegra.svg';
import DownloadSvg         from '../../assets/download.svg';

// Tarjeta KANBAN
import TarjetaProductoKanban from '../components/TarjetaProductoKanban';
import TarjetaProductoDesktop from '../components/TarjetaProductoDesktop';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

type CategOdoo = string | [number, string];

type ProductoLite = {
  id: number;
  name: string;
  list_price: number;
  default_code?: string;
  write_date?: string;
  description?: string;
  image_md_url?: string | null;    
  image_thumb_url?: string | null; 
  categ_id?: CategOdoo;
  attributes?: { k: string; v: string }[];
  stock_state?: string;
  stock_qty?: number; 
  price_offer?: number | null; 
  marca?: string;
  marca_name?: string;
  brand?: string;
};

const RAW = (process.env.EXPO_PUBLIC_API_URL || 'https://app-sb-production.up.railway.app').trim();
const API_URL = RAW.replace(/\/+$/, '');

const ACTIVE_BG = '#139EDB';
const INACTIVE_BG = '#D8E4EC';
const ACTIVE_TEXT = '#FFFFFF';
const INACTIVE_TEXT = '#8FA2AF';

const SCREEN_WIDTH = Dimensions.get('window').width;
const BUTTON_HEIGHT = 64;
const CUT_SIZE = 20; 
const SHADOW_OFFSET = 4;
const BLUR_RADIUS = 3;
const BTN_WIDTH = SCREEN_WIDTH - 16;

const MODAL_W_PCT = 0.92; 
const MODAL_W = SCREEN_WIDTH * MODAL_W_PCT;
const MODAL_CUT = 20;

function withAltMedia(u?: string | null): string | null {
  if (!u) return null;
  if (!(u.includes('firebasestorage.googleapis.com') || u.includes('appspot.com'))) return u;
  return u.includes('?') ? (u.includes('alt=media') ? u : `${u}&alt=media`) : `${u}?alt=media`;
}

function bestImageUri(p?: ProductoLite | null): string {
  if (!p) return '';
  const md = withAltMedia(p.image_md_url || null);
  const th = withAltMedia(p.image_thumb_url || null);
  return md || th || '';
}

function ProductoDetalle() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const isDesktopWeb = useIsDesktopWeb();
  // @ts-ignore
  const { id, preload } = route.params || {};
  const numericId = typeof id === 'string' ? Number(id) : id;

  const [producto, setProducto] = useState<ProductoLite | null>(preload || null);
  const [loading, setLoading] = useState(!preload);
  const [cantidad, setCantidad] = useState(1);
  const [tab, setTab] = useState<'carac' | 'desc'>('carac');
  const [desktopTab, setDesktopTab] = useState<'desc' | 'acc' | 'res'>('desc');
  const [relacionados, setRelacionados] = useState<any[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [validGallery, setValidGallery] = useState<string[]>([]);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);

  const [modalType, setModalType] = useState<'imagenes' | 'ficha' | 'precios' | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [modalHeight, setModalHeight] = useState(300);
  const [plazosData, setPlazosData] = useState<any[]>([]);
  const [discountRules, setDiscountRules] = useState<any>({});

  const { addToCart, items, updateQuantity } = useCartStore();
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore(); 

  const scaleAnimAgregar = useRef(new Animated.Value(1)).current;

  const animatePress = (scaleValue: Animated.Value) => {
    Animated.sequence([
      Animated.timing(scaleValue, { toValue: 0.94, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleValue, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  // --- ANIMACIÓN "PRODUCTO VOLANDO AL CARRITO" (solo desktop) ---
  const mainImgRef = useRef<View>(null);
  const flyAnim = useRef(new Animated.Value(0)).current;
  const [flyItem, setFlyItem] = useState<{ uri: string; startX: number; startY: number; w: number; h: number; dx: number; dy: number } | null>(null);

  const triggerFlyToCart = (uri: string) => {
    const node = mainImgRef.current as any;
    if (!node || !node.measureInWindow || !uri) return;
    node.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (!w || !h) return;
      const winW = Dimensions.get('window').width;
      const targetX = winW - 90;
      const targetY = 34;
      // Volamos solo un thumbnail chico del PNG (no la caja gris completa),
      // centrado sobre la imagen principal.
      const size = 110;
      const startX = x + w / 2 - size / 2;
      const startY = y + h / 2 - size / 2;
      flyAnim.setValue(0);
      setFlyItem({ uri, startX, startY, w: size, h: size, dx: targetX - startX - size / 2, dy: targetY - startY - size / 2 });
    });
  };

  // Arranca la animación recién en el efecto, una vez que el Modal/Animated.View
  // del ítem volador ya está montado (si se llama .start() en el mismo tick que
  // el setFlyItem, el driver nativo no llega a "engancharse" al nodo y la
  // animación queda congelada en el frame inicial).
  useEffect(() => {
    if (!flyItem) return;
    const anim = Animated.timing(flyAnim, { toValue: 1, duration: 700, useNativeDriver: false });
    anim.start(() => setFlyItem(null));
    return () => anim.stop();
  }, [flyItem]);

  // 1. RESET DE ESTADOS AL CAMBIAR DE ID
  useEffect(() => {
    if (!preload) {
      setProducto(null);
      setLoading(true);
    } else {
      setProducto(preload);
      setLoading(false);
    }
    setValidGallery([]);
    setRelacionados([]);
    setCantidad(1);
    setCurrentImgIndex(0);
    setSelectedItems({});
  }, [numericId]);

  // 2. CARGA DE CONFIGURACIÓN GLOBAL (Roles y Plazos)
  useEffect(() => {
    async function initData() {
        try {
            const cuit = await getCuitFromStorage();
            if (cuit) {
              const res = await axios.get(`${API_URL}/usuario-perfil?cuit=${cuit}`);
              if (res.data?.role?.toUpperCase() === 'ADMIN') setIsAdmin(true);
            }
            const [resPlazos, resRules] = await Promise.all([
                axios.get(`${API_URL}/plazos-pago`),
                axios.get(`${API_URL}/admin/plazos-descuentos`)
            ]);
            setPlazosData(resPlazos.data || []);
            setDiscountRules(resRules.data || {});
        } catch (e) {}
    }
    initData();
  }, []);

  // 3. CARGA DE INFO Y STOCK FÍSICO
  useEffect(() => {
    let active = true;
    async function fetchInfo() {
      try {
        const res = await axios.get(`${API_URL}/producto/${numericId}/info`);
        if (active && res.data) {
          setProducto(prev => ({ ...prev, ...res.data, id: numericId }));
          setLoading(false);
        }
      } catch (e) { if (active) setLoading(false); }
    }
    fetchInfo();
    return () => { active = false; };
  }, [numericId]);

  // 4. LÓGICA DE PRECIO (SOPORTE OFERTA REACTIVO)
  const precioBase = useMemo(() => {
    if (producto?.price_offer && producto.price_offer > 0) return producto.price_offer;
    return producto?.list_price || 0;
  }, [producto?.price_offer, producto?.list_price]);

  const esOferta = useMemo(() => !!(producto?.price_offer && producto.price_offer > 0), [producto?.price_offer]);

  // 5. GALERÍA DINÁMICA
  useEffect(() => {
    let active = true;
    async function checkAvailableImages() {
      const mainImg = bestImageUri(producto);
      if (!mainImg) return;
      if (!producto?.default_code || !mainImg.includes('firebasestorage')) {
        if (active) setValidGallery([mainImg]);
        return;
      }
      const sku = producto.default_code.trim();
      const baseUrl = mainImg.split('/o/')[0];
      const folderPath = `products%2F${encodeURIComponent(sku)}%2F`;
      const candidates = [
        `${baseUrl}/o/${folderPath}${encodeURIComponent(sku)}_1.webp?alt=media`,
        `${baseUrl}/o/${folderPath}${encodeURIComponent(sku)}_2.webp?alt=media`,
        `${baseUrl}/o/${folderPath}${encodeURIComponent(sku)}_3.webp?alt=media`,
      ];
      const existing = [mainImg];
      for (const url of candidates) {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) existing.push(url);
        } catch (e) {}
      }
      if (active) {
        setValidGallery(existing.sort((a, b) => a === mainImg ? -1 : 0));
      }
    }
    if (producto?.id === numericId) checkAvailableImages();
    return () => { active = false; };
  }, [producto?.default_code, producto?.id, numericId]);

  const plazosFiltrados = useMemo(() => {
    return plazosData.filter(term => {
      const rule = discountRules[term.id];
      return rule && parseFloat(rule.min_compra) > 0;
    });
  }, [plazosData, discountRules]);

  // --- LÓGICA ESTRICTA DE PRECIOS SEGÚN OFERTA VS PLAZO ---
  const calculateFinalPrice = (termId: number) => {
    const rule = discountRules[termId];
    const listPrice = producto?.list_price || 0;

    if (!rule) return esOferta ? precioBase : listPrice;
    
    const d1 = parseFloat(rule.descuento || 0);
    const d2 = parseFloat(rule.descuento2 || 0);
    
    // Calculamos el precio de lista puro con los descuentos que ofrezca este plazo
    const priceWithDiscount = listPrice * (1 - d1 / 100) * (1 - d2 / 100);
    
    // Identificamos si este plazo específico admite convivencia con ofertas
    const permiteOferta = rule.oferta === true || rule.oferta === 'true' || rule.oferta === 1 || rule.oferta === '1';

    if (esOferta) {
        if (!permiteOferta) {
            // EXCEPCIÓN: El plazo indica que NO aplica a ofertas.
            // Por lo tanto, el cliente pierde el beneficio de la oferta y se le cobra
            // el precio de lista normal (con el descuento propio del plazo si lo hubiera).
            return priceWithDiscount;
        } else {
            // REGLA GENERAL: El plazo SÍ admite ofertas.
            // Se respeta el precio de oferta de forma intocable, SIN aplicar los descuentos del plazo.
            return precioBase;
        }
    }

    // Si el producto no está en oferta, se cobra el precio de lista con los descuentos del plazo.
    return priceWithDiscount;
  };

  // --- LÓGICA DE FAVORITOS (SYNC CON DB) ---
  const handleToggleFav = async (prod: ProductoLite | any) => {
    if (!prod) return;
    const favorito = isFavorite(prod.id);
    
    if (favorito) {
        removeFavorite(prod.id);
    } else {
        addFavorite(prod as any);
    }

    try {
        const cuit = await getCuitFromStorage();
        if (cuit) {
            await axios.post(`${API_URL}/favoritos/toggle`, {
                cuit,
                product_id: prod.id
            });
        }
    } catch (error) {
        console.error("Error sincronizando favorito:", error);
    }
  };

  const handleAddToCartFlow = () => {
    if (!producto) return;
    const existingItem = items.find(it => it.product_id === producto.id);
    if (existingItem) {
      updateQuantity(producto.id, existingItem.product_uom_qty + cantidad);
    } else {
      addToCart({ 
        product_id: producto.id, 
        name: producto.name, 
        price_unit: precioBase, 
        list_price: producto.list_price, 
        product_uom_qty: cantidad, 
        default_code: producto.default_code || '' 
      });
    }
    setCantidad(1);
  };

  const toggleItemSelection = (index: number) => {
    setSelectedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleDownloadDirect = async (url: string, filename: string) => {
    if (Platform.OS === 'web') {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return true;
      } catch (e) { return false; }
    }
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería.');
      return false;
    }
    try {
      const fs = FileSystem as any;
      const baseDir = fs.cacheDirectory || fs.documentDirectory;
      const fileUri = `${baseDir}${filename}`;
      const downloadRes = await FileSystem.downloadAsync(url, fileUri);
      await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
      return true;
    } catch (e) { return false; }
  };

  const handleBulkDownload = async () => {
    const indices = Object.keys(selectedItems).filter(key => selectedItems[Number(key)]);
    if (indices.length === 0) return;
    setIsDownloading(true);
    for (const key of indices) {
      const idx = Number(key);
      const sku = producto?.default_code || 'PROD';
      if (modalType === 'imagenes') {
        const uri = validGallery[idx];
        const name = idx === 0 ? `${sku}.webp` : `${sku}_${idx}.webp`;
        await handleDownloadDirect(uri, name);
      } else if (modalType === 'ficha') {
        const refUrl = producto?.image_md_url || producto?.image_thumb_url;
        if (refUrl) {
          const finalUrl = `${refUrl.split('/o/')[0]}/o/fichas_tecnicas%2F${encodeURIComponent(sku)}.webp?alt=media`;
          await handleDownloadDirect(finalUrl, `${sku}_ficha.webp`);
        }
      }
    }
    setIsDownloading(false);
    setModalType(null);
    Alert.alert('Éxito', 'Descarga completada 📸');
  };

  const handleDownloadManual = () => {
    if (!producto?.default_code) return;
    const refUrl = producto.image_md_url || producto.image_thumb_url;
    if (!refUrl) return;
    const finalUrl = `${refUrl.split('/o/')[0]}/o/manuales%2F${encodeURIComponent(producto.default_code.trim())}.pdf?alt=media`;
    Linking.openURL(finalUrl).catch(() => Alert.alert('Error', 'No se encontró el manual.'));
  };

  useEffect(() => {
    async function fetchRelacionados() {
      setLoadingRel(true);
      try {
        const { data } = await axios.get(`${API_URL}/producto/${numericId}/relacionados`, { params: { limit: 10 } });
        let items = Array.isArray(data) ? data : data?.items || [];

        // FALLBACK: si el backend no tiene relaciones cargadas para este producto,
        // completamos con productos de la misma categoría.
        if (items.length === 0) {
          const categId = Array.isArray(producto?.categ_id) ? producto.categ_id[0] : null;
          if (categId) {
            try {
              const resCat = await axios.get(`${API_URL}/productos`, { params: { categ_id: categId, limit: 11 } });
              const catItems = Array.isArray(resCat.data) ? resCat.data : resCat.data?.items || [];
              items = catItems.filter((p: any) => p.id !== numericId).slice(0, 10);
            } catch (e) {}
          }
        }

        setRelacionados(items);
      } catch (e) { setRelacionados([]); } finally { setLoadingRel(false); }
    }
    fetchRelacionados();
  }, [numericId, producto?.categ_id]);

  // --- LÓGICA DE FORMATEO DE MONEDA ---
  const formatMoney = (v?: number) => {
    if (v == null) return '0,00';
    const [intPart, decPart] = v.toFixed(2).split('.');
    return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart}`;
  };

  const modalBgPath = `M ${MODAL_CUT},0 H ${MODAL_W - MODAL_CUT} L ${MODAL_W},${MODAL_CUT} V ${modalHeight - MODAL_CUT} L ${MODAL_W - MODAL_CUT},${modalHeight} H ${MODAL_CUT} L 0,${modalHeight - MODAL_CUT} V ${MODAL_CUT} Z`;

  if (loading || !producto || producto.id !== numericId) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#139EDB" /></View>;
  }

  const isMainFav = isFavorite(producto.id);

  const getBrandString = () => {
    const raw = producto?.marca_name || producto?.brand || producto?.marca;
    if (Array.isArray(raw) && (raw as any).length > 1) return String((raw as any)[1]);
    if (typeof raw === 'string') return raw;
    return '';
  };
  const categTxt = Array.isArray(producto?.categ_id) ? producto?.categ_id[1] : (producto?.categ_id || 'PRODUCTO');
  const brandTxt = getBrandString();

  const modalBodyContent = (
    <>
      <View style={styles.modalHeader}>
        <Feather name={modalType === 'precios' ? "dollar-sign" : modalType === 'imagenes' ? "image" : "file-text"} size={24} color="#374151" />
        <Text style={styles.modalNewTitle}>{modalType === 'precios' ? 'PRECIOS POR PLAZO' : 'DISPONIBLES'}</Text>
      </View>
      <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
        {modalType === 'precios' && (
            <View style={styles.tableHead}>
                <Text style={[styles.th, { flex: 2.2 }]}>PLAZO</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>DTO%</Text>
                <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>MIN. USD</Text>
                <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>TOTAL</Text>
            </View>
        )}
        {modalType === 'precios' ? (
          plazosFiltrados.map((term) => {
            const rule = discountRules[term.id] || {};
            const finalPrice = calculateFinalPrice(term.id);
            const permiteOferta = rule.oferta === true || rule.oferta === 'true' || rule.oferta === 1 || rule.oferta === '1';
            const totalDto = parseFloat(rule.descuento || 0) + parseFloat(rule.descuento2 || 0);
            let dtoText = totalDto > 0 ? `-${totalDto}%` : '—';
            let dtoColor = '#10B981';
            if (esOferta) {
                if (permiteOferta) { dtoText = 'OFERTA'; dtoColor = '#D32F2F'; }
            }
            return (
                <View key={term.id} style={styles.modalNewItem}>
                    <Text style={[styles.td, { flex: 2.2 }]} numberOfLines={1}>{term.nombre}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'center', color: dtoColor, fontFamily: 'BarlowCondensed-Bold' }]}>{dtoText}</Text>
                    <Text style={[styles.td, { flex: 1.5, textAlign: 'center' }]}>${formatMoney(rule.min_compra)}</Text>
                    <Text style={[styles.tdPrice, { flex: 1.5, textAlign: 'right' }]}>${formatMoney(finalPrice)}</Text>
                </View>
            );
          })
        ) : (
          (modalType === 'imagenes' ? validGallery : [0]).map((uri, idx) => {
            const isSelected = !!selectedItems[idx];
            return (
              <TouchableOpacity key={idx} style={styles.modalNewItem} onPress={() => toggleItemSelection(idx)}>
                  <View style={styles.itemThumbWrap}>{modalType === 'imagenes' ? <Image source={{ uri: typeof uri === 'string' ? uri : undefined }} style={styles.modalMiniThumb} /> : <Feather name="file" size={20} style={{alignSelf:'center', marginTop:12}} />}</View>
                  <Text style={styles.modalNewItemText}>{modalType === 'imagenes' ? `${producto.default_code}${idx > 0 ? '_'+idx : ''}.webp` : `${producto.default_code}_ficha.webp`}</Text>
                  <View style={[styles.radioButtonOuter, isSelected && styles.radioButtonOuterSelected]}>{isSelected && <View style={styles.radioButtonInner} />}</View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      <View style={styles.modalButtonsRow}>
        <TouchableOpacity style={[styles.btnModal, styles.btnVolverModal]} onPress={() => setModalType(null)}><Text style={styles.btnModalText}>VOLVER</Text></TouchableOpacity>
        {modalType !== 'precios' && (
            <TouchableOpacity style={[styles.btnModal, styles.btnDownloadModal, isDownloading && { opacity: 0.7 }]} onPress={handleBulkDownload} disabled={isDownloading}>
            {isDownloading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.btnModalText}>DESCARGAR</Text>}
            </TouchableOpacity>
        )}
      </View>
    </>
  );

  const sharedModal = (
    <Modal visible={modalType !== null} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalType(null)}>
            <View style={[styles.modalWrapper, { width: MODAL_W }]}>
                <View style={StyleSheet.absoluteFill}><Svg width="100%" height="100%"><Path d={modalBgPath} fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={3} /></Svg></View>
                <View style={styles.modalInner} onLayout={(e) => { if(e.nativeEvent.layout.height > 50) setModalHeight(e.nativeEvent.layout.height) }}>
                    {modalBodyContent}
                </View>
            </View>
        </Pressable>
    </Modal>
  );

  // Modal desktop: mismo contenido, tarjeta compacta y centrada (no estirada al 92% del viewport como en mobile).
  const desktopModal = (
    <Modal visible={modalType !== null} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalType(null)}>
            <Pressable style={dstyles.dModalCard} onPress={(e: any) => e.stopPropagation?.()}>
                {modalBodyContent}
            </Pressable>
        </Pressable>
    </Modal>
  );

  // ===========================================================================
  // VERSIÓN DESKTOP WEB — calco del Figma "Productos - 5"
  // ===========================================================================
  if (isDesktopWeb) {
    const mainImgUri = validGallery[currentImgIndex] || bestImageUri(producto);
    return (
      <View style={dstyles.screen}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <View style={dstyles.page}>
            <Text style={dstyles.breadcrumb} numberOfLines={1}>
              {[categTxt, producto.name, brandTxt, producto.default_code].filter(Boolean).join(' // ')}
            </Text>

            <View style={dstyles.topRow}>
              <View style={dstyles.topRowLeft}>
                <Text style={dstyles.titleD}>{producto.name}</Text>
                <Text style={dstyles.codeD}>{producto.default_code || ''}</Text>

                <View style={dstyles.mainRow}>
                  <View style={dstyles.imageSection}>
                    <View style={{ flexDirection: 'row', gap: 24 }}>
                      <View style={dstyles.thumbCol}>
                        {validGallery.map((uri, i) => (
                          <Pressable key={i} onPress={() => setCurrentImgIndex(i)} style={[dstyles.thumb, i === currentImgIndex && dstyles.thumbActive]}>
                            <Image source={{ uri }} style={dstyles.thumbImg} contentFit="contain" />
                          </Pressable>
                        ))}
                      </View>

                      <View style={dstyles.mainImgBox} ref={mainImgRef}>
                        {mainImgUri ? <Image source={{ uri: mainImgUri }} style={dstyles.mainImg} contentFit="contain" /> : null}
                      </View>
                    </View>

                    <View style={dstyles.imgActionsRow}>
                      <Feather name="camera" size={20} color="#3F3F3F" />
                      <View style={{ flexDirection: 'row', gap: 18 }}>
                        <Feather name="share-2" size={18} color="#3F3F3F" />
                        <Feather name="printer" size={18} color="#3F3F3F" />
                      </View>
                    </View>
                  </View>

                  <View style={dstyles.specsCol}>
                    <Text style={dstyles.specsTitle}>Características</Text>
                    {producto.attributes?.map((s, i) => (
                      <View key={i} style={dstyles.specRowD}>
                        <Text style={dstyles.specKeyD}>{s.k}</Text>
                        <Text style={dstyles.specValD}>{s.v}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={dstyles.actionPanel}>
                <View style={dstyles.starsRow}>
                  {[0, 1, 2, 3, 4].map((i) => <Feather key={i} name="star" size={22} color="#3F3F3F" style={{ marginRight: 4 }} />)}
                </View>
                <Text style={dstyles.reviewsText}>+500 Reseñas</Text>

                {esOferta && <Text style={dstyles.oldPriceD}>${formatMoney(producto?.list_price)}</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[dstyles.priceD, esOferta && { color: '#D32F2F' }]}>${formatMoney(precioBase)}</Text>
                  {esOferta && <View style={styles.offerBadge}><Text style={styles.offerBadgeText}>OFERTA</Text></View>}
                </View>
                <TouchableOpacity onPress={() => setModalType('precios')}>
                  <Text style={dstyles.paymentsLinkD}>Ver precios según plazo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={dstyles.btnAgregarD}
                  onPress={() => { handleAddToCartFlow(); triggerFlyToCart(mainImgUri); }}
                  activeOpacity={0.85}
                >
                  <Text style={dstyles.btnAgregarTextD}>Agregar al carrito</Text>
                  <Feather name="shopping-cart" size={18} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={dstyles.qtyRowD}>
                  <Text style={dstyles.qtyLabelD}>Cantidad</Text>
                  <View style={dstyles.qtyBoxD}>
                    <TouchableOpacity onPress={() => setCantidad(c => Math.max(1, c - 1))} style={dstyles.qtyBtnWrapD}>
                      <Feather name="chevron-left" size={16} color="#8A8A8A" />
                    </TouchableOpacity>
                    <View style={dstyles.qtyValBadgeD}><Text style={dstyles.qtyValD}>{cantidad}</Text></View>
                    <TouchableOpacity onPress={() => setCantidad(c => c + 1)} style={dstyles.qtyBtnWrapD}>
                      <Feather name="chevron-right" size={16} color="#8A8A8A" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={dstyles.compareRowD}>
                  <TouchableOpacity style={dstyles.compareBtnD}>
                    <Text style={dstyles.compareTextD}>Comparar</Text>
                    <Feather name="repeat" size={15} color="#1C9BD8" />
                  </TouchableOpacity>
                  <TouchableOpacity style={dstyles.compareBtnD} onPress={() => handleToggleFav(producto)}>
                    <Text style={dstyles.compareTextD}>Guardar</Text>
                    <Feather name="heart" size={15} color="#1C9BD8" style={isMainFav ? { opacity: 1 } : { opacity: 0.5 }} />
                  </TouchableOpacity>
                </View>

                <View style={dstyles.dividerD} />
                <View style={dstyles.downloadHeaderRowD}>
                  <Text style={dstyles.downloadTitleD}>Descargar</Text>
                  <Feather name="download" size={20} color="#313131" />
                </View>
                <TouchableOpacity onPress={() => { setSelectedItems({}); setModalType('ficha'); }}>
                  <Text style={dstyles.downloadLinkD}>Ficha Técnica</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDownloadManual}>
                  <Text style={dstyles.downloadLinkD}>Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setSelectedItems({}); setModalType('imagenes'); }}>
                  <Text style={dstyles.downloadLinkD}>Imágenes</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={dstyles.tabsRowD}>
              <TouchableOpacity onPress={() => setDesktopTab('desc')}><Text style={[dstyles.tabTextD, desktopTab === 'desc' && dstyles.tabTextActiveD]}>DESCRIPCIÓN</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setDesktopTab('acc')}><Text style={[dstyles.tabTextD, desktopTab === 'acc' && dstyles.tabTextActiveD]}>ACCESORIOS</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setDesktopTab('res')}><Text style={[dstyles.tabTextD, desktopTab === 'res' && dstyles.tabTextActiveD]}>RESEÑAS</Text></TouchableOpacity>
            </View>
            <View style={dstyles.tabDividerD} />
            <View style={dstyles.tabContentD}>
              {desktopTab === 'desc' && <Text style={dstyles.descTextD}>{producto.description?.replace(/<[^>]*>?/gm, '') || 'Sin descripción.'}</Text>}
              {desktopTab === 'acc' && <Text style={dstyles.descTextD}>Sin accesorios disponibles para este producto.</Text>}
              {desktopTab === 'res' && <Text style={dstyles.descTextD}>Aún no hay reseñas para este producto.</Text>}
            </View>

            {(loadingRel || relacionados.length > 0) && (
              <>
                <Text style={dstyles.relTitleD}>PRODUCTOS RELACIONADOS</Text>
                {loadingRel ? (
                  <ActivityIndicator color="#1C9BD8" style={{ marginVertical: 30 }} />
                ) : (
                <View style={dstyles.relGridD}>
                  {relacionados.slice(0, 5).map((p) => {
                    const relPrecioBase = (p.price_offer && p.price_offer > 0) ? p.price_offer : p.list_price;
                    return (
                      <View key={p.id} style={dstyles.relCellD}>
                        <TarjetaProductoDesktop
                          producto={p}
                          isFavorite={isFavorite(p.id)}
                          onToggleFavorito={() => handleToggleFav(p)}
                          onPressDetalle={() => navigation.push('ProductoDetalle', { id: p.id, preload: p })}
                          onPressAgregar={(qty: number) => {
                            const exist = items.find(it => it.product_id === p.id);
                            if (exist) updateQuantity(p.id, exist.product_uom_qty + qty);
                            else addToCart({ ...p, product_id: p.id, product_uom_qty: qty, price_unit: relPrecioBase, default_code: p.default_code || '' });
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
        {desktopModal}
        {flyItem && (
          <Modal transparent visible animationType="none">
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Animated.View
                style={[
                  dstyles.flyItem,
                  {
                    left: flyItem.startX,
                    top: flyItem.startY,
                    width: flyItem.w,
                    height: flyItem.h,
                    opacity: flyAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                    transform: [
                      { translateX: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, flyItem.dx] }) },
                      { translateY: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, flyItem.dy] }) },
                      { scale: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.15] }) },
                    ],
                  },
                ]}
              >
                <Image source={{ uri: flyItem.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
              </Animated.View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 160 }]} bounces={false}>
      <Text style={styles.breadcrumb}>{(Array.isArray(producto?.categ_id) ? producto?.categ_id[1] : 'PRODUCTO')} // {producto?.name}</Text>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{producto?.name}</Text>
          <Text style={styles.code}>{producto?.default_code || '—'}</Text>
        </View>
      </View>

      <View style={styles.imageBox}>
        <FlatList
          data={validGallery}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setCurrentImgIndex(Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 32)))}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH - 56, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: item }} style={styles.image} contentFit="contain" cachePolicy="memory-disk" />
            </View>
          )}
          keyExtractor={(item, index) => index.toString()}
        />
        
        {/* BOTÓN FAVORITO FLOTANTE */}
        <TouchableOpacity 
            style={styles.favBtnFloating} 
            onPress={() => handleToggleFav(producto)}
            activeOpacity={0.8}
        >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    fill={isMainFav ? "#1C9BD8" : "none"} 
                    stroke="#1C9BD8" 
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </TouchableOpacity>

        {validGallery.length > 1 && (
          <View style={styles.pagers}>
            {validGallery.map((_, i) => <View key={i} style={[styles.dot, i === currentImgIndex && styles.dotActive]} />)}
          </View>
        )}
      </View>

      <View style={styles.priceBlock}>
        {esOferta && <Text style={styles.oldPrice}>${formatMoney(producto?.list_price)}</Text>}
        <View style={styles.rowAlign}>
            <Text style={[styles.price, esOferta && { color: '#D32F2F' }]}>${formatMoney(precioBase)}</Text>
            {esOferta && <View style={styles.offerBadge}><Text style={styles.offerBadgeText}>OFERTA</Text></View>}
        </View>
        <TouchableOpacity onPress={() => setModalType('precios')}>
            <Text style={styles.paymentsLink}>Ver precios según plazo</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 10 }}>
        <View style={{ width: '100%', height: 56 }}>
          <ContenedorQtySvg width="100%" height="100%" />
          <View style={styles.qtyOverlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={styles.qtyLabel}>Cantidad: <Text style={styles.qtyNum}>{cantidad}</Text></Text>
              <View style={{ marginLeft: 16, flexDirection: 'row', alignItems: 'center' }}>
                <StockSemaphore status={producto?.stock_state} size={12} />
                <Text style={styles.stockText}>{producto?.stock_state === 'red' ? 'Stock Crítico' : producto?.stock_state === 'orange' ? 'Stock Medio' : 'Disponible'}</Text>
              </View>
            </View>
            <View style={styles.qtyControls}>
              <TouchableOpacity onPress={() => setCantidad(c => Math.max(1, c - 1))}><MenosSvg width={36} height={36} /></TouchableOpacity>
              <TouchableOpacity onPress={() => setCantidad(c => c + 1)} style={{ marginLeft: 10 }}><MasSvg width={36} height={36} /></TouchableOpacity>
            </View>
          </View>
        </View>
        {isAdmin && <Text style={styles.stockHint}>STOCK FÍSICO: {producto?.stock_qty != null ? Math.floor(producto.stock_qty) : '--'} u.</Text>}
      </View>

      <Animated.View style={{ transform: [{ scale: scaleAnimAgregar }] }}>
        <TouchableOpacity onPress={() => { animatePress(scaleAnimAgregar); handleAddToCartFlow(); }} style={{ marginTop: 12 }} activeOpacity={0.9}><AgregarCarritoSvg width="100%" height={46} /></TouchableOpacity>
      </Animated.View>

      <View style={styles.tabsRow}>
        <PillButton label="CARACTERÍSTICAS" active={tab === 'carac'} onPress={() => setTab('carac')} />
        <PillButton label="DESCRIPCIÓN" active={tab === 'desc'} onPress={() => setTab('desc')} />
      </View>
      {tab === 'carac' ? <CaracteristicasCard producto={producto!} /> : <DescripcionCard producto={producto!} />}

      <View style={{ marginTop: 18 }}>
        <View style={[styles.relHeader, styles.fullBleedLeft]}><Text style={styles.relTitle}>PRODUCTOS RELACIONADOS</Text></View>
        {loadingRel ? <ActivityIndicator color="#139EDB" style={{ margin: 20 }} /> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relCarousel}>
            {relacionados.map((p) => {
                const relPrecioBase = (p.price_offer && p.price_offer > 0) ? p.price_offer : p.list_price;
                return (
                    <View key={p.id} style={{ marginRight: 10 }}>
                        <TarjetaProductoKanban
                        width={180} producto={p}
                        isFavorite={isFavorite(p.id)}
                        onToggleFavorito={() => handleToggleFav(p)} 
                        onPressDetalle={() => navigation.push('ProductoDetalle', { id: p.id, preload: p })}
                        onPressAgregar={(qty) => {
                            const exist = items.find(it => it.product_id === p.id);
                            if (exist) updateQuantity(p.id, exist.product_uom_qty + qty);
                            else addToCart({ ...p, product_id: p.id, product_uom_qty: qty, price_unit: relPrecioBase, default_code: p.default_code || '' });
                        }}
                        />
                    </View>
                )
            })}
          </ScrollView>
        )}
      </View>

      <View style={{ marginTop: 24 }}>
        <View style={[styles.downloadHeader, styles.fullBleedLeft]}><Text style={styles.downloadTitle}>DESCARGAR</Text></View>
        <HexagonButton label="DESCARGAR MANUAL" onPress={handleDownloadManual} variant="blue" />
        <HexagonButton label="DESCARGAR FICHA TÉCNICA" onPress={() => { setSelectedItems({}); setModalType('ficha'); }} variant="black" />
        <HexagonButton label="DESCARGAR IMÁGENES" onPress={() => { setSelectedItems({}); setModalType('imagenes'); }} variant="blue" />
      </View>

      {sharedModal}
    </ScrollView>
  );
}

// --- AUXILIARES ---
function HexagonButton({ label, onPress, variant }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const Arrow = variant === 'blue' ? FlechaAzulSvg : FlechaNegraSvg;
  const pathData = `M 0,0 H ${BTN_WIDTH - CUT_SIZE} L ${BTN_WIDTH},${CUT_SIZE} V ${BUTTON_HEIGHT - CUT_SIZE} L ${BTN_WIDTH - CUT_SIZE},${BUTTON_HEIGHT} H 0 Z`;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ width: BTN_WIDTH, height: BUTTON_HEIGHT + 6, marginLeft: -16, marginBottom: 8, transform: [{ scale }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={{ flex: 1 }}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs><Filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><FeGaussianBlur in="SourceAlpha" stdDeviation={BLUR_RADIUS} /></Filter></Defs>
          <G><Path d={pathData} fill="#000" opacity={0.15} transform={`translate(0, ${SHADOW_OFFSET})`} filter="url(#shadow)" /><Path d={pathData} fill="#FFFFFF" /></G>
        </Svg>
        <View style={styles.hexContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Arrow width={28} height={28} style={{ marginRight: 12 }} /><Text style={styles.btnText}>{label}</Text></View>
          <DownloadSvg width={24} height={24} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function PillButton({ label, active, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.pillWrap}>
      <View style={[styles.pillBody, { backgroundColor: active ? ACTIVE_BG : INACTIVE_BG }]}>
        <Text style={{ color: active ? ACTIVE_TEXT : INACTIVE_TEXT, fontFamily: 'BarlowCondensed-Bold', fontSize: 16 }}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function CaracteristicasCard({ producto }: { producto: ProductoLite }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}><Text style={styles.cardTitle}>{producto.name}</Text><Text style={styles.cardBrand}>DETALLES</Text></View>
      <Text style={styles.cardCode}>{producto.default_code || '—'}</Text>
      <View style={styles.specsList}>
        {producto.attributes?.map((s, i) => (
          <View key={i} style={styles.specRow}><Text style={styles.specKey}>{s.k}</Text><View style={styles.specLine} /><Text style={styles.specVal}>{s.v}</Text></View>
        ))}
      </View>
    </View>
  );
}

function DescripcionCard({ producto }: { producto: ProductoLite }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}><Text style={styles.cardTitle}>{producto.name}</Text></View>
      <Text style={styles.cardCode}>{producto.default_code || '—'}</Text>
      <Text style={styles.descText}>{producto.description?.replace(/<[^>]*>?/gm, '') || 'Sin descripción.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#FFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  breadcrumb: { fontSize: 11, color: '#7B8A96', marginBottom: 8, fontFamily: 'BarlowCondensed-Light' },
  headerRow: { flexDirection: 'row', marginBottom: 10 },
  title: { fontSize: 24, fontFamily: 'BarlowCondensed-Bold', color: '#222' },
  code: { fontSize: 18, fontFamily: 'BarlowCondensed-Light', color: '#3A4A57' },
  imageBox: { height: 264, backgroundColor: '#FFF', borderRadius: 16, padding: 12, elevation: 2, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, position: 'relative' },
  image: { width: '100%', height: 230 },
  favBtnFloating: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 2 },
  pagers: { flexDirection: 'row', marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D3EAF6', marginHorizontal: 3 },
  dotActive: { backgroundColor: '#2DB4E8' },
  priceBlock: { marginVertical: 15 },
  rowAlign: { flexDirection: 'row', alignItems: 'center' },
  price: { fontSize: 38, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },
  oldPrice: { fontSize: 18, color: '#9CA3AF', textDecorationLine: 'line-through', fontFamily: 'BarlowCondensed-Bold' },
  offerBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, borderRadius: 4, marginLeft: 10, borderWidth: 1, borderColor: '#FECACA' },
  offerBadgeText: { color: '#D32F2F', fontSize: 12, fontFamily: 'BarlowCondensed-Bold' },
  paymentsLink: { color: '#139EDB', fontSize: 13, textDecorationLine: 'underline', fontFamily: 'BarlowCondensed-Light', marginTop: 4 },
  qtyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  qtyLabel: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },
  qtyNum: { fontFamily: 'BarlowCondensed-Bold' },
  stockText: { marginLeft: 6, fontSize: 13, fontFamily: 'BarlowCondensed-Medium', color: '#2B2B2B' },
  stockHint: { color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, marginTop: 4, marginLeft: 6 },
  qtyControls: { flexDirection: 'row', marginLeft: 'auto' },
  tabsRow: { flexDirection: 'row', marginTop: 20, gap: 10 },
  pillWrap: { flex: 1, height: 48 },
  pillBody: { flex: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  card: { marginTop: 15, backgroundColor: '#FFF', borderRadius: 10, padding: 15, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#2B2B2B' },
  cardBrand: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#3A4A57' },
  cardCode: { fontFamily: 'BarlowCondensed-Light', fontSize: 16, color: '#3A4A57', marginBottom: 6 },
  specsList: { marginTop: 8 },
  specRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  specKey: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  specLine: { flex: 1, height: 1, backgroundColor: '#D9E3EA', marginHorizontal: 8 },
  specVal: { fontFamily: 'BarlowCondensed-Light', fontSize: 15, color: '#2B2B2B' },
  descText: { fontFamily: 'BarlowCondensed-Light', fontSize: 15, color: '#2B2B2B', lineHeight: 20 },
  relHeader: { backgroundColor: '#2B2B2B', padding: 8, borderTopRightRadius: 12, borderBottomRightRadius: 12, marginLeft: -16, alignSelf: 'flex-start' },
  relTitle: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  relCarousel: { paddingVertical: 10, paddingLeft: 6 },
  downloadHeader: { backgroundColor: '#2B2B2B', padding: 8, borderTopRightRadius: 12, borderBottomRightRadius: 12, marginLeft: -16, alignSelf: 'flex-start', marginBottom: 15 },
  downloadTitle: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  fullBleedLeft: { marginLeft: -16 },
  hexContent: { position: 'absolute', top: 0, left: 24, right: 32, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalWrapper: { justifyContent: 'center' },
  modalInner: { padding: 20, paddingVertical: 25 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalNewTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, marginLeft: 10, color: '#1F2937' },
  modalNewItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', justifyContent: 'space-between' },
  tableHead: { flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: '#E5E7EB' },
  th: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: '#6B7280' },
  td: { fontFamily: 'BarlowCondensed-Regular', fontSize: 14, color: '#333' },
  tdPrice: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#139EDB' },
  itemThumbWrap: { width: 50, height: 50, borderRadius: 6, backgroundColor: '#F9F9F9', overflow: 'hidden', marginRight: 15, justifyContent: 'center' },
  modalMiniThumb: { width: '100%', height: '100%' },
  modalNewItemText: { flex: 1, fontSize: 14, fontFamily: 'BarlowCondensed-Medium', color: '#333' },
  radioButtonOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  radioButtonOuterSelected: { borderColor: '#139EDB' },
  radioButtonInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#139EDB' },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  btnModal: { flex: 0.48, height: 46, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnVolverModal: { backgroundColor: '#8FA2AF' },
  btnDownloadModal: { backgroundColor: '#139EDB' },
  btnModalText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }
});

// --- Estilos exclusivos de desktop: calco del Figma "Productos - 5" ---
const dstyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  page: { width: '100%', paddingHorizontal: 40, paddingTop: 30 },
  breadcrumb: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#636363', marginBottom: 10, textTransform: 'uppercase' },

  topRow: { flexDirection: 'row', alignItems: 'stretch' },
  topRowLeft: { flex: 3 },

  titleD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 60, lineHeight: 62, color: '#636363', textTransform: 'uppercase' },
  codeD: { fontFamily: 'BarlowCondensed-Light', fontSize: 26, color: '#636363', marginTop: 2, marginBottom: 22 },

  mainRow: { flexDirection: 'row', alignItems: 'stretch' },
  imageSection: { flex: 2, paddingRight: 24 },
  thumbCol: { gap: 10 },
  thumb: { width: 74, height: 74, borderRadius: 8, backgroundColor: '#F3F3F3', borderWidth: 1, borderColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center' },
  thumbActive: { borderColor: '#1C9BD8', borderWidth: 2 },
  thumbImg: { width: '80%', height: '80%' },
  mainImgBox: { flex: 1, height: 460, borderRadius: 10, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' },
  mainImg: { width: '85%', height: '85%' },
  imgActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 },

  specsCol: { flex: 1, paddingHorizontal: 24, borderLeftWidth: 1, borderLeftColor: '#EFEFEF' },
  specsTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 30, color: '#3F3F3F', marginBottom: 14, textTransform: 'uppercase' },
  specRowD: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  specKeyD: { fontFamily: 'Rubik', fontWeight: '600', fontSize: 15, color: '#3F3F3F', flex: 1 },
  specValD: { fontFamily: 'Rubik', fontWeight: '300', fontSize: 15, color: '#3F3F3F' },

  actionPanel: { flex: 1, paddingLeft: 24, paddingTop: 4, borderLeftWidth: 1, borderLeftColor: '#EFEFEF' },
  starsRow: { flexDirection: 'row' },
  reviewsText: { fontFamily: 'Rubik', fontWeight: '700', fontSize: 14, color: '#3F3F3F', marginTop: 6 },
  oldPriceD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 16 },
  priceD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 42, color: '#3F3F3F', marginTop: 4 },
  paymentsLinkD: { fontFamily: 'Rubik', fontSize: 12, color: '#1C9BD8', textDecorationLine: 'underline', marginTop: 4, marginBottom: 16 },

  qtyRowD: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 14 },
  qtyLabelD: { fontFamily: 'Rubik', fontWeight: '700', fontSize: 17, color: '#3F3F3F' },
  qtyBoxD: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 999, padding: 4, gap: 4 },
  qtyBtnWrapD: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  qtyValBadgeD: { minWidth: 32, height: 32, borderRadius: 16, backgroundColor: '#139EDB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  qtyValD: { fontFamily: 'Rubik', fontWeight: '700', fontSize: 15, color: '#FFFFFF' },

  btnAgregarD: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, borderRadius: 10, backgroundColor: '#1C9BD8', paddingHorizontal: 20, marginBottom: 16 },
  btnAgregarTextD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 19, color: '#FFFFFF' },

  compareRowD: { flexDirection: 'row', gap: 10 },
  compareBtnD: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 8, backgroundColor: '#F3F4F6' },
  compareTextD: { fontFamily: 'Rubik', fontWeight: '600', fontSize: 15, color: '#1C9BD8' },

  dividerD: { height: 1, backgroundColor: '#EFEFEF', marginVertical: 16 },
  downloadHeaderRowD: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  downloadTitleD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 24, color: '#313131' },
  downloadLinkD: { fontFamily: 'Rubik', fontSize: 15, color: '#313131', paddingVertical: 4 },

  tabsRowD: { flexDirection: 'row', gap: 40, marginTop: 40 },
  tabTextD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 26, color: '#9CA3AF', paddingBottom: 12, letterSpacing: 0.5 },
  tabTextActiveD: { color: '#1C9BD8', borderBottomWidth: 2, borderBottomColor: '#1C9BD8' },
  tabDividerD: { height: 1, backgroundColor: '#EFEFEF', marginTop: -1, marginBottom: 20 },
  tabContentD: { maxWidth: 720 },
  descTextD: { fontFamily: 'Rubik', fontSize: 15, lineHeight: 24, color: '#3F3F3F' },

  relTitleD: { fontFamily: 'BarlowCondensed-Bold', fontSize: 46, color: '#1C9BD8', marginTop: 50, marginBottom: 18, textTransform: 'uppercase' },
  relGridD: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  relCellD: { width: 205 },

  // Modal compacto para desktop (precios por plazo / ficha técnica / imágenes)
  dModalCard: { width: 460, maxWidth: '90%', maxHeight: '80%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 8 },

  // Animación "producto volando al carrito"
  flyItem: { position: 'absolute', zIndex: 9999 },
});

export default ProductoDetalle;