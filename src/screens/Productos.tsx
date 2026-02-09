import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image as RNImage, 
  ScrollView,
  Modal,
  Pressable,
  RefreshControl,
  TouchableOpacity,
  Keyboard,
  Dimensions,
  TouchableWithoutFeedback
} from 'react-native';
import axios from 'axios';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Rect, Polyline, Line, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons'; 

import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import authStorage from '../utils/authStorage'; 
import type { ProductoBase } from '../store/cartStore';
import SearchBar from '../components/SearchBar';
import type { RootStackParamList } from '../types/navigation';
import { API_URL } from '../config'; // <--- IMPORTACIÓN CENTRALIZADA

import TarjetaProductoListado from '../components/TarjetaProductoListado';
import TarjetaProductoKanban from '../components/TarjetaProductoKanban';
import SkeletonProduct from '../components/SkeletonProduct'; 
import EmptyState from '../components/EmptyState'; // <--- COMPONENTE ESTADO VACÍO
import FlechaProductosSvg from '../../assets/flechaProductos.svg';

// --- ASSETS ---
const BANNER_BG = require('../../assets/carrusel.jpg'); 
import ProductoDestacadoBannerSvg from '../../assets/productoDestacadoBanner.svg';
import ShLogoSvg from '../../assets/sh.svg'; 

// --- HELPERS ---
function withAltMedia(u?: string | null): string | null {
  if (!u) return null;
  if (!(u.includes('firebasestorage.googleapis.com') || u.includes('appspot.com'))) return u;
  return u.includes('?') ? (u.includes('alt=media') ? u : `${u}&alt=media`) : `${u}?alt=media`;
}

const normalizeText = (str: string) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

// --- ICONOS SVG ---
const IconFunnel = () => ( <Svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2B2B2B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></Svg> );
const IconPuzzle = () => ( <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2B2B2B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M19 10.95c-1.636 0-3.053-.98-3.778-2.426V4h-7.79c-.56-1.527-2.023-2.616-3.73-2.616C1.65 1.384 0 3.064 0 5.136c0 1.93 1.43 3.52 3.287 3.73v7.268c-1.857.21-3.287 1.8-3.287 3.73 0 2.072 1.65 3.752 3.702 3.752 1.707 0 3.17-1.09 3.73-2.617h7.79v-4.524c.725-1.446 2.142-2.426 3.778-2.426 2.052 0 3.702-1.68 3.702-3.752 0-2.072-1.65-3.752-3.702-3.752z"/></Svg> );
const IconChevronDown = ({ stroke = "#2B2B2B" }: { stroke?: string }) => ( <Svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><Path d="M6 9l6 6 6-6" /></Svg> );
const IconSearchSmall = () => ( <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></Svg> );
const IconTag = () => ( <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><Path d="M7 7h.01" /></Svg> );
const IconGrid = () => ( <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B2B2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Rect x="3" y="3" width="7" height="7" /><Rect x="14" y="3" width="7" height="7" /><Rect x="14" y="14" width="7" height="7" /><Rect x="3" y="14" width="7" height="7" /></Svg> );
const IconList = () => ( <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B2B2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M8 6h13" /><Path d="M8 12h13" /><Path d="M8 18h13" /><Path d="M3 6h.01" /><Path d="M3 12h.01" /><Path d="M3 18h.01" /></Svg> );
const IconSort = ({ stroke = "#2B2B2B" }: { stroke?: string }) => ( <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Line x1="12" y1="5" x2="12" y2="19" /><Polyline points="19 12 12 19 5 12" /></Svg> );
const IconStock = ({ stroke = "#2B2B2B" }: { stroke?: string }) => ( <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Polyline points="20 6 9 17 4 12" /></Svg> );
const IconCheck = () => ( <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9BD8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><Polyline points="20 6 9 17 4 12" /></Svg> );

interface Producto extends ProductoBase {
  id: number;
  list_price: number;
  price_offer?: number | null; 
  image_128?: string;
  image_thumb_url?: string | null;
  image_md_url?: string | null;
  stock_state?: string;
}

interface Marca { id: number; name: string; }
interface Categoria { id: number; name: string; parent_id?: any; }

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ProductoDetalle'>;
type SortOption = 'default' | 'price_asc' | 'price_desc' | 'name_asc';

const LIMITE = 20;
const HEADER_PAD = 12;
const SEARCH_TO_CAROUSEL_GAP = 16;
const EDGE_KISS = 19; 
const ARROW_W  = 92;
const ARROW_H  = 32;
const TITLE_GAP  = -9;
const TITLE_SIZE = 32;
const ARROW_BASELINE = 0;
const TITLE_BASELINE = -1;

const SCREEN_W = Dimensions.get('window').width;
const MODAL_W = SCREEN_W * 0.92;
const MODAL_CUT = 20;

const attributesCache: Record<number, any[]> = {};

const DynamicCarouselItem = React.memo(({ item, onPress }: { item: any; onPress: () => void }) => {
    const imgUrl = withAltMedia(item.img || item.image_md_url);
    const [attrs, setAttrs] = useState<any[]>(attributesCache[item.id] || []);
    
    useEffect(() => {
        if (item.id && !attributesCache[item.id]) {
            let active = true;
            axios.get(`${API_URL}/producto/${item.id}/info`)
                .then(res => {
                    if (active && res.data && res.data.attributes) {
                        const data = res.data.attributes.slice(0, 5);
                        attributesCache[item.id] = data; 
                        setAttrs(data);
                    }
                }).catch(() => {});
            return () => { active = false; };
        } else if (attributesCache[item.id]) {
            setAttrs(attributesCache[item.id]);
        }
    }, [item.id]);

    return (
        <View style={styles.dynamicBannerContainer}>
            <RNImage source={BANNER_BG} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />
            <View style={styles.svgTitleContainer}><ProductoDestacadoBannerSvg width={200} height={50} /></View>
            <View style={styles.shLogoContainer}><ShLogoSvg width={42} height={28} /></View>
            <TouchableOpacity style={styles.dynamicBannerContent} activeOpacity={0.95} onPress={onPress}>
                <View style={styles.bannerInfoLeft}>
                    <View style={styles.topBlackZone}>
                        <View style={styles.yellowBadge}>
                            <Text style={styles.yellowBadgeText} numberOfLines={2} ellipsizeMode="tail">
                                {item.name ? item.name.toUpperCase() : 'PRODUCTO'}
                            </Text>
                        </View>
                        <Text style={styles.skuText} numberOfLines={1}>{item.sku || item.default_code || ''}</Text>
                    </View>
                    <View style={styles.bottomWhiteZone}>
                        {attrs.length > 0 && (
                            <View style={styles.specsContainer}>{attrs.map((attr, idx) => (
                                <View key={idx} style={styles.specRow}>
                                    <Text style={styles.specLabel} numberOfLines={1}>{attr.k.toUpperCase()}</Text>
                                    <Text style={styles.specValue} numberOfLines={1}>{attr.v}</Text>
                                </View>
                            ))}</View>
                        )}
                    </View>
                </View>
                <View style={styles.bannerImgWrap}>
                    <Image source={{ uri: imgUrl as string }} style={styles.bannerProdImg} contentFit="contain" />
                </View>
            </TouchableOpacity>
        </View>
    );
});

const FilterPill = ({ label, IconStart, IconEnd, onPress, active }: { label: string; IconStart?: React.ComponentType<any>; IconEnd?: React.ComponentType<any>; onPress: () => void; active?: boolean; }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.pillContainer, active && styles.pillActive]}>
      {IconStart && <View style={{ marginRight: 6, opacity: active ? 1 : 0.8 }}><IconStart stroke={active ? "#FFFFFF" : "#2B2B2B"} /></View>}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
      {IconEnd && <View style={{ marginLeft: 4, opacity: active ? 1 : 0.8 }}><IconEnd stroke={active ? "#FFFFFF" : "#2B2B2B"} /></View>} 
    </TouchableOpacity>
);

const Productos = () => {
  const route = useRoute<any>(); 
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  
  const [pagina, setPagina] = useState(0);
  const [hasMas, setHasMas] = useState(true);
  const [isFetchingMas, setIsFetchingMas] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [search, setSearch] = useState('');
  const [marcaSeleccionada, setMarcaSeleccionada] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
  const [onlyStock, setOnlyStock] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [soloOfertas, setSoloOfertas] = useState(false);

  const lastProcessedTs = useRef<number>(0); 
  const blockSearchRef = useRef(false);
  const [isResetting, setIsResetting] = useState(false);
  const [pendingSearchName, setPendingSearchName] = useState<string | null>(null);

  const [pickerModal, setPickerModal] = useState<null | 'marca' | 'categoria'>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const [banners, setBanners] = useState<any[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);

  const [sugerenciasProd, setSugerenciasProd] = useState<Producto[]>([]);
  const [sugerenciasCat, setSugerenciasCat] = useState<Categoria[]>([]);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [modalHeight, setModalHeight] = useState(350);

  const [parentCat, setParentCat] = useState<Categoria | null>(null);

  const addToCart = useCartStore((s) => s.addToCart);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const itemsInCart = useCartStore((s) => s.items);
  
  const favorites = useFavoritesStore((state) => state.favorites);
  const addFavorite = useFavoritesStore((state) => state.addFavorite);
  const removeFavorite = useFavoritesStore((state) => state.removeFavorite);

  const modalBgPath = useMemo(() => {
    return `M ${MODAL_CUT},0 H ${MODAL_W - MODAL_CUT} L ${MODAL_W},${MODAL_CUT} V ${modalHeight - MODAL_CUT} L ${MODAL_W - MODAL_CUT},${modalHeight} H ${MODAL_CUT} L 0,${modalHeight - MODAL_CUT} V ${MODAL_CUT} Z`;
  }, [modalHeight]);

  useFocusEffect(
    useCallback(() => {
        const loadBanners = async () => {
            try {
                // USAMOS API_URL centralizada
                const res = await axios.get(`${API_URL}/config/FEATURED_PRODUCTOS`);
                const list = res.data;

                if (Array.isArray(list) && list.length > 0) {
                    setBanners(list);
                } else {
                    setBanners([{ static: true }]);
                }
            } catch (e) { 
                console.log("Error banners productos:", e);
                setBanners([{ static: true }]); 
            }
        };
        loadBanners();
    }, [])
  );

  useEffect(() => {
    (async () => {
      try {
        const [resMarcas, resCategorias] = await Promise.all([
          axios.get<Marca[]>(`${API_URL}/marcas`),
          axios.get<Categoria[]>(`${API_URL}/categorias`),
        ]);
        setMarcas(resMarcas.data || []);
        setCategorias(resCategorias.data || []);
      } catch (e) { }
    })();
  }, []);

  const fetchProductosDirect = async (append: boolean, currentFilters: any) => {
    try {
      if (!append) setLoading(true);
      if (append) setIsFetchingMas(true);
      const params: any = {
        limit: LIMITE,
        offset: append ? pagina * LIMITE : 0,
        search: currentFilters.search,
        marca_id: currentFilters.marca_id,
        categ_id: currentFilters.categ_id,
      };
      const response = await axios.get(`${API_URL}/productos`, { params });
      const nuevos: Producto[] = Array.isArray(response.data) ? response.data : (response.data?.items ?? []);
      if (append) {
        setProductos((prev) => {
            const existingIds = new Set(prev.map(p => p.id));
            const filteredNuevos = nuevos.filter(p => !existingIds.has(p.id));
            return [...prev, ...filteredNuevos];
        });
        setPagina((p) => p + 1);
      } else {
        setProductos(nuevos);
        setPagina(1);
      }
      setHasMas(nuevos.length === LIMITE);
    } catch (e) {
      if (!append) setProductos([]);
    } finally {
      setLoading(false);
      setIsFetchingMas(false);
      setRefreshing(false);
      setIsResetting(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const { initialCategoryId, ofertaMode, initialCategoryName, ts } = route.params || {};
      
      if (ts && ts > lastProcessedTs.current) {
        lastProcessedTs.current = ts;
        setIsResetting(true); 
        setProductos([]); 
        setPagina(0);
        
        setSearch(''); 
        setMarcaSeleccionada(''); 
        setCategoriaSeleccionada('');
        setOnlyStock(false); 
        setSortOption('default');
        
        if (ofertaMode) {
            setSoloOfertas(true);
        } else {
            setSoloOfertas(false);
        }
        
        blockSearchRef.current = true;
        
        if (initialCategoryName) {
            setPendingSearchName(initialCategoryName);
        } else if (initialCategoryId !== undefined) {
            const catIdString = initialCategoryId.toString();
            setCategoriaSeleccionada(catIdString);
            fetchProductosDirect(false, { search: '', categ_id: catIdString, marca_id: '' });
        } else {
            setIsResetting(false);
            fetchProductosDirect(false, { search: '', marca_id: '', categ_id: '' });
        }
        
        navigation.setParams({ initialCategoryId: undefined, ofertaMode: undefined, initialCategoryName: undefined } as any);
        setTimeout(() => { blockSearchRef.current = false; }, 500);
      }
    }, [route.params])
  );

  useEffect(() => {
      if (pendingSearchName && categorias.length > 0) {
          const term = normalizeText(pendingSearchName);
          const found = categorias.find(c => normalizeText(c.name).includes(term));
          let targetCatId = ''; let targetSearch = '';
          if (found) { targetCatId = String(found.id); setCategoriaSeleccionada(targetCatId); }
          else { targetSearch = pendingSearchName; setSearch(targetSearch); }
          fetchProductosDirect(false, { search: targetSearch, marca_id: '', categ_id: targetCatId });
          setPendingSearchName(null);
      }
  }, [pendingSearchName, categorias]);

  useEffect(() => {
    if (blockSearchRef.current || isResetting) return;
    fetchProductosDirect(false, { search: search, marca_id: marcaSeleccionada, categ_id: categoriaSeleccionada });
  }, [search, marcaSeleccionada, categoriaSeleccionada]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProductosDirect(false, { search: search, marca_id: marcaSeleccionada, categ_id: categoriaSeleccionada });
  }, [search, marcaSeleccionada, categoriaSeleccionada]);

  const handleLoadMore = () => {
    if (!loading && hasMas && !isFetchingMas) {
        fetchProductosDirect(true, { search, marca_id: marcaSeleccionada, categ_id: categoriaSeleccionada });
    }
  };

  useEffect(() => {
    if (!search || search.length < 2) { setShowSugerencias(false); return; }
    const timer = setTimeout(async () => {
        setLoadingSugerencias(true); setShowSugerencias(true);
        const term = normalizeText(search);
        const catsFiltradas = categorias.filter(c => normalizeText(c.name).includes(term)).slice(0, 3);
        setSugerenciasCat(catsFiltradas);
        try {
            const res = await axios.get(`${API_URL}/productos`, { params: { search, limit: 8 } });
            const prods = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
            setSugerenciasProd(prods);
        } catch { setSugerenciasProd([]); } finally { setLoadingSugerencias(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, categorias]);

  const handleSelectCategorySuggestion = (cat: Categoria) => {
      setCategoriaSeleccionada(cat.id.toString());
      setSearch(''); setShowSugerencias(false); Keyboard.dismiss();
  };
  const handleSelectProductSuggestion = (prod: Producto) => {
      setShowSugerencias(false); 
      navigation.navigate('ProductoDetalle', { id: prod.id, preload: prod } as any);
  };

  const limpiarFiltros = () => {
    setMarcaSeleccionada(''); setCategoriaSeleccionada(''); setSearch('');
    setSoloOfertas(false); setOnlyStock(false); setSortOption('default');
  };

  const productosProcesados = useMemo(() => {
    let result = [...productos];
    if (onlyStock) result = result.filter(p => p.stock_state !== 'red');
    if (soloOfertas) result = result.filter(p => p.price_offer && p.price_offer > 0 && p.price_offer < p.list_price);
    if (sortOption !== 'default') {
        result.sort((a, b) => {
            if (sortOption === 'price_asc') return a.list_price - b.list_price;
            if (sortOption === 'price_desc') return b.list_price - a.list_price;
            if (sortOption === 'name_asc') return a.name.localeCompare(b.name);
            return 0;
        });
    }
    return result;
  }, [productos, onlyStock, sortOption, soloOfertas, favorites]); 

  const getSortLabel = () => {
      switch(sortOption) {
          case 'price_asc': return 'MENOR PRECIO';
          case 'price_desc': return 'MAYOR PRECIO';
          case 'name_asc': return 'NOMBRE (A-Z)';
          default: return 'ORDENAR';
      }
  };

  const renderItem = useCallback(({ item }: { item: Producto }) => {
    const isFav = favorites.some(f => f.id === item.id);
    const finalPrice = (item.price_offer && item.price_offer > 0) ? item.price_offer : item.list_price;
    const handlePressDetalle = () => navigation.navigate('ProductoDetalle', { id: item.id, preload: item } as any);
    
    const handlePressAgregar = (quantity: number) => {
        const existing = itemsInCart.find(it => it.product_id === item.id);
        if (existing) {
            updateQuantity(item.id, existing.product_uom_qty + quantity);
        } else if (quantity > 0) {
            addToCart({
                product_id: item.id, name: item.name, price_unit: finalPrice, list_price: item.list_price,
                product_uom_qty: quantity, default_code: item.default_code || '', 
                image_128: item.image_128 ?? undefined, 
                image_md_url: item.image_md_url ?? null, image_thumb_url: item.image_thumb_url ?? null,
            });
        }
    };

    const handleToggleFav = async () => {
        if (isFav) {
            removeFavorite(item.id);
        } else {
            addFavorite(item as any);
        }

        try {
            const cuit = await authStorage.getCuitFromStorage();
            if (cuit) {
                await axios.post(`${API_URL}/favoritos/toggle`, {
                    cuit,
                    product_id: item.id
                });
            }
        } catch (error) {
            console.error("Error sincronizando favorito:", error);
        }
    };

    if (viewMode === 'kanban') {
      const cardWidth = (SCREEN_W - (HEADER_PAD * 2) - 12) / 2;
      return <TarjetaProductoKanban producto={item} isFavorite={isFav} onPressDetalle={handlePressDetalle} onPressAgregar={handlePressAgregar} onToggleFavorito={handleToggleFav} width={cardWidth} />;
    }
    return <TarjetaProductoListado producto={item} isFavorite={isFav} onPressDetalle={handlePressDetalle} onPressAgregar={handlePressAgregar} onToggleFavorito={handleToggleFav} />;
  }, [addToCart, updateQuantity, itemsInCart, favorites, navigation, addFavorite, removeFavorite, viewMode]);

  const handleScrollCarousel = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (SCREEN_W - HEADER_PAD * 2));
    setBannerIndex(index);
  };

  const renderCarouselItem = ({ item }: { item: any }) => {
    if (item.static) return <RNImage source={BANNER_BG} style={styles.bannerImage} resizeMode="cover" />;
    return <DynamicCarouselItem item={item} onPress={() => navigation.navigate('ProductoDetalle', { id: Number(item.id), preload: item } as any)} />;
  };

  // --- MEMOIZACIÓN DEL HEADER ---
  const headerContent = useMemo(() => (
      <View style={styles.scrollHeaderWrap}>
        <View style={{ zIndex: 20 }}>
            <SearchBar value={search} onChangeText={setSearch} onClear={() => { setSearch(''); setShowSugerencias(false); }} placeholder="BUSCAR PRODUCTO O CATEGORÍA" variant="hero" rightIcon containerStyle={{ marginTop: 0, marginBottom: SEARCH_TO_CAROUSEL_GAP, marginHorizontal: 0 }} />
        </View>
        <View style={styles.carouselCard}>
            <FlatList
                data={banners.length > 0 ? banners : [{static: true}]}
                keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : `static-${index}`}
                horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScrollCarousel}
                renderItem={renderCarouselItem}
                style={{ flex: 1 }}
            />
            {banners.length > 1 && (
                <View style={styles.dotsRow}>
                    {banners.map((_, i) => <View key={i} style={[styles.dot, i === bannerIndex && styles.dotActive]} />)}
                </View>
            )}
        </View>
        <View style={styles.pillsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
            <FilterPill label={getSortLabel()} IconStart={IconSort} IconEnd={IconChevronDown} onPress={() => setSortModalVisible(true)} active={sortOption !== 'default'} />
            <FilterPill label="SOLO STOCK" IconStart={IconStock} onPress={() => setOnlyStock(!onlyStock)} active={onlyStock} />
            <FilterPill label="CATEGORÍA" IconStart={IconFunnel} IconEnd={IconChevronDown} onPress={() => { setParentCat(null); setPickerModal('categoria'); }} active={!!categoriaSeleccionada} />
            <FilterPill label="MARCAS" IconStart={IconPuzzle} IconEnd={IconChevronDown} onPress={() => setPickerModal('marca')} active={!!marcaSeleccionada} />
            {soloOfertas && <FilterPill label="OFERTAS 🔥" active={true} onPress={() => setSoloOfertas(false)} />}
            <FilterPill label="LIMPIAR" onPress={limpiarFiltros} active={false} />
          </ScrollView>
        </View>
        <Text style={styles.countText}>{loading || isResetting ? 'Cargando...' : `${productosProcesados.length} producto(s) encontrado(s)`}</Text>
      </View>
  ), [search, banners, bannerIndex, sortOption, onlyStock, categoriaSeleccionada, marcaSeleccionada, soloOfertas, loading, isResetting, productosProcesados.length]);

  const bottomPad = 64 + insets.bottom + 32 + 12;
  const showSkeleton = (loading && pagina === 0 && !refreshing) || isResetting;

  const filteredCategories = useMemo(() => {
    if (!parentCat) return categorias.filter(c => !c.name.includes('/'));
    const prefix = `${parentCat.name} /`;
    return categorias.filter(c => c.name.startsWith(prefix));
  }, [categorias, parentCat]);

  return (
    <TouchableWithoutFeedback onPress={() => { setShowSugerencias(false); Keyboard.dismiss(); }}>
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View style={[styles.fixedHeader, { zIndex: 10 }]}>
            <View style={[styles.titleRow, { marginLeft: -(HEADER_PAD + EDGE_KISS), height: Math.max(ARROW_H, TITLE_SIZE) }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <FlechaProductosSvg width={ARROW_W} height={ARROW_H} style={{ transform: [{ translateY: ARROW_BASELINE }] }} />
                    <View style={{ height: ARROW_H, justifyContent: 'center', marginLeft: TITLE_GAP }}>
                        <Text style={[styles.titleText, { fontSize: TITLE_SIZE, lineHeight: TITLE_SIZE, transform: [{ translateY: TITLE_BASELINE }] }]}>PRODUCTOS</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => setViewMode(prev => prev === 'list' ? 'kanban' : 'list')} style={styles.viewToggleBtn} activeOpacity={0.7}>
                    {viewMode === 'list' ? <IconGrid /> : <IconList />}
                </TouchableOpacity>
            </View>
        </View>
        <View style={{ flex: 1, zIndex: 1 }}>
            {showSkeleton ? (
                <FlatList key="skel" data={[1,2,3,4,5,6]} keyExtractor={(i) => i.toString()} renderItem={() => <SkeletonProduct />} ListHeaderComponent={headerContent} contentContainerStyle={{ paddingTop: 10, paddingBottom: bottomPad }} showsVerticalScrollIndicator={false} />
            ) : (
                <FlatList
                    key={viewMode}
                    data={productosProcesados}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    numColumns={viewMode === 'kanban' ? 2 : 1}
                    columnWrapperStyle={viewMode === 'kanban' ? { justifyContent: 'space-between', paddingHorizontal: HEADER_PAD } : undefined}
                    ListHeaderComponent={headerContent}
                    
                    // --- AQUÍ ESTÁ LA MAGIA DEL EMPTY STATE ---
                    ListEmptyComponent={
                        !loading && !isResetting ? (
                            <EmptyState 
                                title="No se encontraron productos" 
                                message="Intenta ajustar los filtros o buscar con otro término."
                                icon="search"
                            />
                        ) : null
                    }
                    contentContainerStyle={[
                        { paddingTop: 10, paddingBottom: bottomPad },
                        productosProcesados.length === 0 && { flex: 1, justifyContent: 'center' }
                    ]}
                    // ------------------------------------------

                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={isFetchingMas ? <ActivityIndicator size="small" color="#139EDB" style={{ margin: 10 }} /> : null}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1C9BD8']} tintColor="#1C9BD8" progressViewOffset={10} />}
                    
                    // OPTIMIZACIONES DE RENDIMIENTO
                    initialNumToRender={4} 
                    maxToRenderPerBatch={4}
                    windowSize={3}
                    removeClippedSubviews={true}
                    updateCellsBatchingPeriod={50}
                    keyboardShouldPersistTaps="handled"
                />
            )}
            {showSugerencias && (
                <View style={[styles.suggestionsOverlay, { top: insets.top + 60 }]}> 
                    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
                        {loadingSugerencias && (<ActivityIndicator size="small" color="#139EDB" style={{ margin: 20 }} />)}
                        {sugerenciasCat.length > 0 && (
                            <View style={styles.suggestionSection}>
                                <Text style={styles.suggestionTitle}>CATEGORÍAS</Text>
                                {sugerenciasCat.map(cat => ( <TouchableOpacity key={cat.id} style={styles.suggestionRow} onPress={() => handleSelectCategorySuggestion(cat)}><IconTag /><Text style={styles.suggestionText}>{cat.name}</Text></TouchableOpacity> ))}
                            </View>
                        )}
                        {sugerenciasProd.length > 0 && (
                            <View style={styles.suggestionSection}>
                                <Text style={styles.suggestionTitle}>PRODUCTOS</Text>
                                {sugerenciasProd.map(prod => ( <TouchableOpacity key={prod.id} style={styles.suggestionRow} onPress={() => handleSelectProductSuggestion(prod)}><IconSearchSmall /><View style={{ marginLeft: 10, flex: 1 }}><Text numberOfLines={1} style={styles.suggestionText}>{prod.name}</Text>{prod.default_code ? <Text style={styles.suggestionSubText}>{prod.default_code}</Text> : null}</View></TouchableOpacity> ))}
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>

        <Modal visible={pickerModal !== null} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setPickerModal(null)}>
                <View style={[styles.modalWrapper, { width: MODAL_W }]}>
                    <View style={StyleSheet.absoluteFill}>
                        <Svg width="100%" height="100%">
                            <Defs><Filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><FeGaussianBlur in="SourceAlpha" stdDeviation={3} /></Filter></Defs>
                            <G transform="translate(0, 4)">
                                <Path d={modalBgPath} fill="#000" opacity={0.15} filter="url(#shadow)" />
                                <Path d={modalBgPath} fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={2} />
                            </G>
                        </Svg>
                    </View>

                    <View style={styles.modalInner} onLayout={(e) => setModalHeight(e.nativeEvent.layout.height)}>
                        <View style={styles.modalHeaderRow}>
                            {pickerModal === 'categoria' && parentCat ? (
                                <TouchableOpacity onPress={() => setParentCat(null)} style={{ marginRight: 10 }}>
                                    <Feather name="arrow-left" size={22} color="#374151" />
                                </TouchableOpacity>
                            ) : (
                                <Feather name={pickerModal === 'categoria' ? "grid" : "tag"} size={22} color="#374151" style={{ marginRight: 10 }} />
                            )}
                            <Text style={styles.modalNewTitle}>
                                {pickerModal === 'categoria' ? (parentCat ? parentCat.name.toUpperCase() : 'CATEGORÍAS') : 'MARCAS'}
                            </Text>
                        </View>
                        
                        <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                            {(pickerModal === 'categoria' ? filteredCategories : marcas).map((it) => (
                                <TouchableOpacity 
                                    key={it.id} 
                                    style={styles.modalNewItem} 
                                    onPress={() => { 
                                        if (pickerModal === 'categoria') {
                                            const prefix = `${it.name} /`;
                                            const hasChildren = categorias.some(c => c.name.startsWith(prefix));
                                            if (hasChildren && !parentCat) {
                                                setParentCat(it);
                                            } else {
                                                setCategoriaSeleccionada(it.id.toString());
                                                setPickerModal(null);
                                            }
                                        } else {
                                            setMarcaSeleccionada(it.id.toString());
                                            setPickerModal(null);
                                        }
                                    }}
                                >
                                    <Text style={styles.modalItemText}>{it.name.split(' / ').pop()?.toUpperCase()}</Text>
                                    <Feather name="chevron-right" size={18} color="#D1D5DB" />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={styles.modalButtonsRow}>
                            <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#8FA2AF', flex: 1 }]} onPress={() => setPickerModal(null)}>
                                <Text style={styles.btnModalText}>VOLVER</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Pressable>
        </Modal>

        <Modal animationType="slide" transparent={true} visible={sortModalVisible}>
            <TouchableWithoutFeedback onPress={() => setSortModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalWrapper, { width: MODAL_W }]}>
                        <View style={StyleSheet.absoluteFill}>
                            <Svg width="100%" height="100%"><Path d={modalBgPath} fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={2} /></Svg>
                        </View>
                        <View style={styles.modalInner}>
                            <View style={styles.modalHeaderRow}>
                                <Feather name="list" size={22} color="#374151" />
                                <Text style={styles.modalNewTitle}>ORDENAR POR</Text>
                            </View>
                            {[ { id: 'default', label: 'POR DEFECTO' }, { id: 'price_asc', label: 'MENOR PRECIO' }, { id: 'price_desc', label: 'MAYOR PRECIO' }, { id: 'name_asc', label: 'NOMBRE (A-Z)' } ].map((opt) => (
                                <TouchableOpacity key={opt.id} style={styles.modalNewItem} onPress={() => { setSortOption(opt.id as SortOption); setSortModalVisible(false); }}>
                                    <Text style={[styles.modalItemText, sortOption === opt.id && { color: '#139EDB', fontFamily: 'BarlowCondensed-Bold' }]}>{opt.label}</Text>
                                    {sortOption === opt.id && <IconCheck />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
        </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  fixedHeader: { backgroundColor: '#ffffff', paddingHorizontal: HEADER_PAD, paddingTop: 12, paddingBottom: 4 },
  scrollHeaderWrap: { paddingHorizontal: HEADER_PAD, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, alignSelf: 'stretch', justifyContent: 'space-between' },
  titleText: { marginLeft: 8, fontSize: 26, color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold' },
  viewToggleBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: 8 },
  carouselCard: { backgroundColor: '#E6EBEF', height: 264, borderRadius: 14, overflow: 'hidden', elevation: 2 },
  dynamicBannerContainer: { width: SCREEN_W - (HEADER_PAD * 2), height: '100%', overflow: 'hidden', borderRadius: 14 },
  dynamicBannerContent: { flex: 1, flexDirection: 'row' },
  bannerImage: { width: SCREEN_W - (HEADER_PAD * 2), height: '100%', borderRadius: 14 },
  svgTitleContainer: { position: 'absolute', top: 15, left: 15, zIndex: 10 },
  shLogoContainer: { position: 'absolute', top: 15, right: 15, zIndex: 10 },
  bannerInfoLeft: { flex: 1.1, paddingLeft: 4, paddingVertical: 12, justifyContent: 'flex-start' },
  topBlackZone: { justifyContent: 'center', marginTop: 70 },
  yellowBadge: { backgroundColor: '#FFD700', paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', transform: [{ skewX: '-10deg' }], marginLeft: -6 },
  yellowBadgeText: { fontFamily: 'BarlowCondensed-Bold', color: '#000', fontSize: 12, lineHeight: 16, textTransform: 'uppercase', marginLeft: 4, transform: [{ skewX: '10deg' }] },
  skuText: { fontFamily: 'BarlowCondensed-Bold', color: '#FFF', fontSize: 12, fontStyle: 'italic', textShadowColor: 'rgba(0, 0, 0, 0.9)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2, marginLeft: 4 },
  bottomWhiteZone: { marginTop: 'auto', paddingBottom: 20, paddingRight: 10 },
  specsContainer: { paddingLeft: 4 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#FFD700', paddingVertical: 1 },
  specLabel: { fontFamily: 'BarlowCondensed-Bold', color: '#000', fontSize: 9, flex: 1 },
  specValue: { fontFamily: 'BarlowCondensed-Regular', color: '#333', fontSize: 9, textAlign: 'right' },
  bannerImgWrap: { flex: 0.9, justifyContent: 'center', paddingRight: 10 },
  bannerProdImg: { width: '120%', height: '110%', position: 'absolute', bottom: -40, right: 15, transform: [{ rotate: '5deg' }] },
  dotsRow: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row' },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ffffff', marginHorizontal: 3 },
  dotActive: { backgroundColor: '#2DB4E8' },
  pillsRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center' },
  pillContainer: { flexDirection: 'row', alignItems: 'center', height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#2B2B2B', backgroundColor: '#FFFFFF', paddingHorizontal: 12, marginRight: 8 },
  pillActive: { backgroundColor: '#2B2B2B' },
  pillText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: '#2B2B2B' },
  pillTextActive: { color: '#FFFFFF' },
  countText: { marginTop: 10, color: '#666', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalWrapper: { justifyContent: 'center' },
  modalInner: { padding: 25 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#F3F4F6', paddingBottom: 10 },
  modalNewTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, marginLeft: 10, color: '#1F2937', letterSpacing: 0.5 },
  modalNewItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', justifyContent: 'space-between' },
  modalItemText: { fontFamily: 'BarlowCondensed-Medium', fontSize: 16, color: '#374151' },
  modalButtonsRow: { marginTop: 25 },
  btnModal: { height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnModalText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 15 },
  sortText: { fontFamily: 'BarlowCondensed-Regular', fontSize: 18, color: '#555' }, 
  sortTextActive: { fontFamily: 'BarlowCondensed-Bold', color: '#1C9BD8' }, 

  suggestionsOverlay: { position: 'absolute', left: HEADER_PAD, right: HEADER_PAD, maxHeight: 300, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', elevation: 10, zIndex: 999 },
  suggestionSection: { paddingVertical: 8 },
  suggestionTitle: { fontSize: 11, fontFamily: 'BarlowCondensed-Bold', color: '#9CA3AF', paddingHorizontal: 12, marginBottom: 4, letterSpacing: 0.5 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  suggestionText: { marginLeft: 8, fontSize: 15, fontFamily: 'BarlowCondensed-Regular', color: '#1F2937' },
  suggestionSubText: { fontSize: 12, color: '#9CA3AF', fontFamily: 'BarlowCondensed-Light' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999', fontSize: 16 }
});

export default Productos;