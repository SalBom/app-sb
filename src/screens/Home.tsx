import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  TextInput,
  PanResponder,
  Pressable,
  Modal,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Linking,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import axios from 'axios';
import { useVideoPlayer, VideoView } from 'expo-video';
import { API_URL } from '../config';
import { removeBackground } from '../utils/removeBg';

// --- ASSETS DESKTOP WEB (calcados del diseño Figma "Pagina Salbom") ---
const WebHeroChevron = require('../../assets/web-home/hero_chevron.png');
// Fotos reales del diseño Figma (ya recortadas por Figma al tamaño exacto de cada sección)
const WebPhotoHero = require('../../assets/web-home/photo_hero.png');
const WebPhotoMinorista = require('../../assets/web-home/photo_minorista.png');
// Sección "Nosotros": foto de los calefactores (reemplaza la anterior de los operarios).
const WebPhotoNosotros = require('../../assets/web-home/calefactores.jpg');
const WebPhotoNoticias = require('../../assets/web-home/photo_noticias.png');
const WebCatIcon1 = require('../../assets/web-home/cat_icon_1.png');
const WebCatIcon2 = require('../../assets/web-home/cat_icon_2.png');
const WebCatIcon3 = require('../../assets/web-home/cat_icon_3.png');
const WebCatIcon4 = require('../../assets/web-home/cat_icon_4.png');
const WebCatIcon5 = require('../../assets/web-home/cat_icon_5.png');
const WebCatIcon6 = require('../../assets/web-home/cat_icon_6.png');
const WebCatIcon7 = require('../../assets/web-home/cat_icon_7.png');

const WEB_CATEGORIES = [
  { icon: WebCatIcon1, keyword: 'Motosierras' },
  { icon: WebCatIcon2, keyword: 'Maquinaria para Taller' },
  { icon: WebCatIcon3, keyword: 'Grupos y Motores' },
  { icon: WebCatIcon4, keyword: 'Sistema de Pintura' },
  { icon: WebCatIcon5, keyword: 'Maquinaria para Jardín' },
  { icon: WebCatIcon6, keyword: 'Desmalezadoras' },
  { icon: WebCatIcon7, keyword: 'Cortadoras de Césped' },
];

// SVGs
import FlechaCategoriaSvg from '../../assets/flechaCategoria.svg';
import VectorHomeSvg from '../../assets/vectorHome.svg';
import PoPTCbannerSvg from '../../assets/PoPTCbanner.svg'; 
import NuevoIngresoPopUPSvg from '../../assets/NuevoIngresoPopUP.svg';
import FlechaBannerSvg from '../../assets/flechaBanner.svg';
import { Ionicons } from '@expo/vector-icons';

const videoHome = require('../../assets/videoHome.mp4'); 

// --- IMÁGENES PNG ---
const _CatTallerImg = require('../../assets/maquinariaParaTaller.png');
const _CatJardinImg = require('../../assets/maquinariaParaJardin.png');
const _CatBombasImg = require('../../assets/BombasFiltros.png');
const _CatGruposImg = require('../../assets/gruposYmotores.png');
const _CatAccesoriosImg = require('../../assets/lubricantesYaccesorios.png');

import ProductosDestacadosSvg from '../../assets/productosDestacados.svg';
import DeslizaSvg from '../../assets/desliza.svg';
import FondoDestacadoSvg from '../../assets/fondoDestacado.svg';
import MouseSvg from '../../assets/mouse.svg'; 

import ShimuraDestacadoSvg from '../../assets/shimuraDestacado.svg';
import IsseiDestacadoSvg from '../../assets/isseiDestacado.svg';

const NosotrosFoto = require('../../assets/nosotros.png');
import CartCardSvg from '../../assets/cartCard.svg';
import UserCardSvg from '../../assets/userCard.svg';
import CCardSvg   from '../../assets/cCard.svg';
import ComCardSvg from '../../assets/comCard.svg';
const MinoristaImg = require('../../assets/minorista.jpg');

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PAD_X = 14;
const HERO_W = SCREEN_W;
const HERO_IMG_H = 378;
const SVG_W = SCREEN_W * 0.60;
const SVG_H = 120;             
const CATS_STACK_H = 350 + SVG_H;

// --- OPTIMIZACIÓN: Valores fijos en lugar de onLayout ---
const CATS_SECTION_Y_FIXED = 480; 
const NOSOTROS_SECTION_Y_FIXED = 1350; 

// --- CONFIG POPUPS ---
// En web, Dimensions.get('window') puede devolver 0 al momento en que este
// módulo se evalúa (antes de que el browser calcule el layout), lo que rompía
// el popup en desktop. window.innerWidth es confiable apenas corre en el
// cliente, y mantiene la MISMA fórmula original (95% del ancho, tope 380) para
// que en un celular real (mobile web angosto) el popup siga siendo responsive.
const POPUP_W = Platform.OS === 'web'
  ? Math.min((typeof window !== 'undefined' ? window.innerWidth : 380) * 0.95, 380)
  : Math.min(SCREEN_W * 0.95, 380);
const POPUP_H = 640; 

// --- COMPONENTE ANIMACIÓN ---
const ScrollRevealItem = ({ scrollY, sectionY, itemY, direction, children, ...props }: any) => {
  if (sectionY === 0) return <View {...props}>{children}</View>;
  const itemAbsoluteY = sectionY + itemY;
  const inputRange = [itemAbsoluteY - SCREEN_H + 50, itemAbsoluteY - SCREEN_H + 350];
  const outputRange = direction === 'left' ? [-100, 0] : direction === 'right' ? [100, 0] : [0, 0];
  const translateX = scrollY.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const opacity = scrollY.interpolate({ inputRange, outputRange: [0, 1], extrapolate: 'clamp' });
  return <Animated.View style={[props.style, { opacity, transform: [{ translateX }] }]}>{children}</Animated.View>;
};

const localStyles = StyleSheet.create({ imgStyle: { width: '100%', height: '100%' } });
const CatTallerComp = () => <Image source={_CatTallerImg} style={localStyles.imgStyle} contentFit="contain" transition={200} />;
const CatJardinComp = () => <Image source={_CatJardinImg} style={localStyles.imgStyle} contentFit="contain" transition={200} />;
const CatBombasComp = () => <Image source={_CatBombasImg} style={localStyles.imgStyle} contentFit="contain" transition={200} />;
const CatGruposComp = () => <Image source={_CatGruposImg} style={localStyles.imgStyle} contentFit="contain" transition={200} />;
const CatAccesoriosComp = () => <Image source={_CatAccesoriosImg} style={localStyles.imgStyle} contentFit="contain" transition={200} />;

export default function Home() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && windowWidth >= 1024;

  // Carrusel de categorías (solo desktop): las flechas scrollean de a 3 íconos por vez.
  const categoriasScrollRef = useRef<ScrollView>(null);
  const categoriasScrollX = useRef(0);
  const CATEGORIA_STEP = (100 + 16) * 3;
  const CATEGORIA_MAX_SCROLL = Math.max(0, (100 + 16) * WEB_CATEGORIES.length - 16 - 900);
  const scrollCategorias = (dir: 1 | -1) => {
    const next = Math.min(CATEGORIA_MAX_SCROLL, Math.max(0, categoriasScrollX.current + dir * CATEGORIA_STEP));
    categoriasScrollX.current = next;
    categoriasScrollRef.current?.scrollTo({ x: next, animated: true });
  };

const go = (keyword: string) => {
      navigation.navigate('Productos', {
          screen: 'ProductosList', 
          params: { 
              initialCategoryName: keyword,
              ts: Date.now() 
          }
      });
  };

  const player = useVideoPlayer(videoHome, player => {
    player.loop = true;
    player.muted = true;
    // En desktop web no se renderiza el <VideoView> del hero (se usa fondo estático),
    // así que no hay que reproducirlo para no saturar la red.
    if (!isDesktopWeb) player.play();
  });

  const [featuredList, setFeaturedList] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const featuredListRef = useRef<any[]>([]);
  const currentIndexRef = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  // --- OPTIMIZACIÓN: Apagar video al scrollear ---
  useEffect(() => {
    if (!player || isDesktopWeb) return;
    const scrollListenerId = scrollY.addListener(({ value }) => {
      // Si el scroll supera la altura del video (aprox 350px) y el video está reproduciendo, lo pausamos
      if (value > 350 && player.playing) {
        player.pause();
      }
      // Si volvemos arriba y la pantalla está en foco, lo reanudamos
      else if (value <= 350 && !player.playing && isFocused) {
        player.play();
      }
    });

    return () => {
      scrollY.removeListener(scrollListenerId);
    };
  }, [player, isFocused]);

  const [showPopup, setShowPopup] = useState(false);
  const [popupSlides, setPopupSlides] = useState<any[]>([]);
  const popupScale = useRef(new Animated.Value(0)).current; 
  
  const [email, setEmail] = useState('');
  const [loadingNews, setLoadingNews] = useState(false);

  useEffect(() => { featuredListRef.current = featuredList; }, [featuredList]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const pan = useRef(new Animated.ValueXY()).current;
  const mouseScale = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const buttonOpacity = useRef(new Animated.Value(1)).current;

  // Desktop hero animation values
  const heroShimmerX = useRef(new Animated.Value(0)).current;
  const heroAccentScale = useRef(new Animated.Value(1)).current;
  const heroAccentOpacity = useRef(new Animated.Value(0.4)).current;
  const heroProductOpacity = useRef(new Animated.Value(1)).current;
  const heroProductScale = useRef(new Animated.Value(1)).current;
  const heroProductTranslateY = useRef(new Animated.Value(0)).current;
  const heroHoverRef = useRef(false);

  useEffect(() => {
    fetchPopups();
  }, []);

  // Auto-avance de productos en el hero desktop cada 4 segundos con fade+scale+slide
  const advanceHeroProduct = (nextIndex: number) => {
    Animated.parallel([
      Animated.timing(heroProductOpacity,     { toValue: 0,   duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(heroProductScale,       { toValue: 0.9, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(heroProductTranslateY,  { toValue: -14, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setCurrentIndex(nextIndex);
      heroProductTranslateY.setValue(14);
      Animated.parallel([
        Animated.timing(heroProductOpacity,    { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(heroProductScale,      { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(heroProductTranslateY, { toValue: 0, friction: 7, tension: 90, useNativeDriver: true }),
      ]).start();
    });
  };

  useEffect(() => {
    if (!isDesktopWeb || featuredList.length <= 1) return;
    const interval = setInterval(() => {
      if (heroHoverRef.current) return; // pausa mientras el mouse está sobre el producto
      advanceHeroProduct((currentIndexRef.current + 1) % featuredList.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isDesktopWeb, featuredList.length]);

  // Inject CSS dot-grid pattern animado on hero (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktopWeb) return;
    const existing = (document as any).getElementById('salbom-hero-pattern');
    if (existing) return;
    const style = (document as any).createElement('style');
    style.id = 'salbom-hero-pattern';
    style.textContent = `
      @keyframes dotDrift {
        0%   { background-position: 0 0; }
        50%  { background-position: 14px 14px; }
        100% { background-position: 0 0; }
      }
      #salbom-hero-pattern-view {
        background-image: radial-gradient(rgba(28,155,216,0.22) 1.5px, transparent 1.5px);
        background-size: 28px 28px;
        animation: dotDrift 8s ease-in-out infinite;
      }
      .sb-reveal { opacity: 0; transform: translateY(26px); transition: opacity 0.65s ease, transform 0.65s cubic-bezier(0.16, 1, 0.3, 1); }
      .sb-reveal.sb-in { opacity: 1; transform: translateY(0); }
      @media (prefers-reduced-motion: reduce) {
        .sb-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
        #salbom-hero-pattern-view { animation: none; }
      }
    `;
    (document as any).head.appendChild(style);
  }, [isDesktopWeb]);

  // Reveal-on-scroll de las secciones (web desktop): IntersectionObserver agrega
  // .sb-in cuando la sección entra al viewport y la CSS transition hace el resto.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktopWeb) return;
    const doc: any = document;
    const win: any = window;
    if (!win.IntersectionObserver) return;
    const ids = ['sb-rv-beneficios', 'sb-rv-minorista', 'sb-rv-categorias', 'sb-rv-nosotros', 'sb-rv-noticias', 'sb-rv-newsletter', 'sb-rv-distribuidores'];
    const obs = new win.IntersectionObserver((entries: any[]) => {
      entries.forEach((e: any) => {
        if (e.isIntersecting) { e.target.classList.add('sb-in'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    ids.forEach((id) => {
      const el = doc.getElementById(id);
      if (el) { el.classList.add('sb-reveal'); obs.observe(el); }
    });
    return () => obs.disconnect();
  }, [isDesktopWeb]);

  useEffect(() => {
    if (!isDesktopWeb) return;
    Animated.loop(
      Animated.timing(heroShimmerX, { toValue: 1, duration: 5000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroAccentScale, { toValue: 1.12, duration: 2800, useNativeDriver: true }),
        Animated.timing(heroAccentScale, { toValue: 1, duration: 2800, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroAccentOpacity, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(heroAccentOpacity, { toValue: 0.35, duration: 2800, useNativeDriver: true }),
      ])
    ).start();
    return () => {
      heroShimmerX.stopAnimation();
      heroAccentScale.stopAnimation();
      heroAccentOpacity.stopAnimation();
    };
  }, [isDesktopWeb]);

  useEffect(() => {
    if (isFocused) {
      loadFeatured();
      if (!isDesktopWeb && player && !player.playing) player.play();
    } else {
      if (player) player.pause();
    }
  }, [isFocused]);

  const fetchPopups = async () => {
      try {
          const resTC = await axios.get(`${API_URL}/config/popup_tc`);
          const resNew = await axios.get(`${API_URL}/config/popup_new_arrivals`);

          const slides = [];

          if (resTC.data && resTC.data.enabled) {
              slides.push({
                  type: 'TC',
                  data: {
                      rate: resTC.data.rate || '1485',
                      date: resTC.data.date || '08/01/2026'
                  }
              });
          }

          if (resNew.data && resNew.data.enabled) {
              slides.push({
                  type: 'NEW',
                  data: {
                      products: resNew.data.products || []
                  }
              });
          }

          if (slides.length > 0) {
              setPopupSlides(slides);
              setTimeout(() => {
                  setShowPopup(true);
                  Animated.spring(popupScale, {
                      toValue: 1,
                      friction: 7,
                      tension: 40,
                      useNativeDriver: true
                  }).start();
              }, 600);
          } else {
              setShowPopup(false);
          }

      } catch (e) { 
          // Silencioso en producción
      }
  };

  const closePopup = () => {
      Animated.timing(popupScale, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
      }).start(() => {
          setShowPopup(false);
      });
  };

  const handleSubscribe = async () => {
      if (!email || !email.includes('@') || email.length < 5) {
          Alert.alert("Atención", "Por favor ingresa un correo válido.");
          return;
      }
      
      setLoadingNews(true);
      try {
          await axios.post(`${API_URL}/subscribe`, { email: email });
          Alert.alert("¡Gracias!", "Te has suscrito correctamente a nuestra comunidad.");
          setEmail('');
      } catch (error) {
          Alert.alert("Error", "Hubo un problema al suscribirte. Intenta nuevamente.");
      } finally {
          setLoadingNews(false);
      }
  };

  const openMinoristaLink = () => {
      Linking.openURL('[https://share.google/9avSJoSckfq4iFjoZ](https://share.google/9avSJoSckfq4iFjoZ)').catch(() => {});
  };

  const renderPopupSlide = ({ item }: any) => {
      if (item.type === 'TC') {
          return (
            <View style={s.slideContainer}>
                <PoPTCbannerSvg width={POPUP_W} height={POPUP_H} style={StyleSheet.absoluteFillObject} />
                <View style={s.popupTextContainer}>
                    <Text style={s.popupDate}>{item.data.date}</Text>
                    <Text style={s.popupTitle}>TIPO DE{"\n"}CAMBIO</Text>
                    <Text style={s.popupBodyTitle}>Estimados clientes:</Text>
                    <Text style={s.popupBody}>
                        Les informamos que a partir del día {item.data.date.split('/').slice(0,2).join('/')}, se tomará el dólar al siguiente valor:
                    </Text>
                    <Text style={s.popupPrice}>${item.data.rate}</Text>
                    <Text style={s.popupFooter}>
                        <Text style={{fontFamily:'BarlowCondensed-Bold'}}>IMPORTANTE:</Text> No se despachara mercadería a quienes tengan facturas vencidas o sin documentar. En caso de no haber cancelado las proformas pendientes las mismas se actualizaran al nuevo tipo de cambio sin excepción.
                    </Text>
                </View>
            </View>
          );
      } else if (item.type === 'NEW') {
          return (
            <View style={s.slideContainer}>
                <NuevoIngresoPopUPSvg width={POPUP_W} height={POPUP_H} style={StyleSheet.absoluteFillObject} />
                <View style={s.newArrivalsContent}>
                    <View style={s.productsScrollWrapper}>
                        <FlatList 
                            data={item.data.products}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(prod:any) => String(prod.id)}
                            initialNumToRender={2}
                            maxToRenderPerBatch={2}
                            windowSize={3}
                            removeClippedSubviews={true}
                            renderItem={({item: prod}) => (
                                <View style={s.productSlide}>
                                    <Image source={{ uri: prod.img }} style={s.productImg} contentFit="contain" />
                                    <Text style={s.productName} numberOfLines={2}>{prod.name}</Text>
                                    <Text style={s.productSku}>{prod.sku}</Text>
                                    <TouchableOpacity style={s.verBtn} onPress={() => {
                                        closePopup();
                                        navigation.navigate('ProductoDetalle', { id: Number(prod.id) });
                                    }}>
                                        <Text style={s.verBtnText}>VER PRODUCTO</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </View>
                    {item.data.products.length > 1 && (
                        <View style={s.swipeIndicator}>
                            <DeslizaSvg width={100} height={30} />
                        </View>
                    )}
                </View>
            </View>
          );
      }
      return null;
  };

  const loadFeatured = async () => {
    try {
        const res = await axios.get(`${API_URL}/config/FEATURED_HOME`);
        const list = res.data;

        if (Array.isArray(list) && list.length > 0) {
            setFeaturedList(list);
            if (currentIndex >= list.length) setCurrentIndex(0);
            contentOpacity.setValue(1); 
            buttonOpacity.setValue(1);
        }
    } catch(e) { 
        // Silencioso
    }
  };

  const currentItem = featuredList[currentIndex];
  const isShimura = currentItem ? (currentItem.brandRaw || currentItem.name || '').toLowerCase().includes('shimura') : false;
  const isIssei = currentItem ? (currentItem.brandRaw || currentItem.name || '').toLowerCase().includes('issei') : false;

  // Recorte de fondo (solo hero desktop web): cachea por URL de foto, así cada
  // producto se procesa una sola vez por sesión. Mientras no está listo se
  // muestra la foto original recortada en círculo como fallback.
  const [heroBgCache, setHeroBgCache] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isDesktopWeb || !currentItem?.img) return;
    if (heroBgCache[currentItem.img]) return;
    let cancelled = false;
    removeBackground(currentItem.img).then((cleanUri) => {
      if (!cancelled) setHeroBgCache((prev) => ({ ...prev, [currentItem.img]: cleanUri }));
    });
    return () => { cancelled = true; };
  }, [isDesktopWeb, currentItem?.img]);
  const heroProductSrc = currentItem ? (heroBgCache[currentItem.img] || currentItem.img) : undefined;

  const handleMousePressIn = () => Animated.spring(mouseScale, { toValue: 0.9, useNativeDriver: true }).start();
  const handleMousePressOut = () => Animated.spring(mouseScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  const handleMousePress = () => { if (currentItem) navigation.navigate('ProductoDetalle', { id: Number(currentItem.id) }); };
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gestureState) => pan.setValue({ x: gestureState.dx, y: 0 }),
      onPanResponderRelease: (_, gestureState) => {
        const currentList = featuredListRef.current;
        const currentIdx = currentIndexRef.current;
        if (gestureState.dx < -60 && currentList.length > 0) {
            Animated.parallel([
                Animated.timing(pan, { toValue: { x: -300, y: 0 }, duration: 200, useNativeDriver: true }),
                Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
                Animated.timing(buttonOpacity, { toValue: 0, duration: 150, useNativeDriver: true }) 
            ]).start(() => {
                const nextIndex = (currentIdx + 1) % currentList.length;
                setCurrentIndex(nextIndex);
                pan.setValue({ x: 0, y: 0 }); 
                Animated.parallel([
                    Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(buttonOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
                ]).start();
            });
        } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, tension: 40, useNativeDriver: true }).start();
        }
      }
    })
  ).current;
  
  const translateX = pan.x.interpolate({ inputRange: [-200, 50], outputRange: [-200, 10], extrapolate: 'clamp' });

  // ---------------------------------------------------------------------------

  // ===========================================================================
  // VERSIÓN DESKTOP WEB — calco del diseño Figma "Pagina Salbom" (Home 1 - CLIENTE)
  // ===========================================================================
  if (isDesktopWeb) {
    return (
      <>
      <Animated.ScrollView style={sw.screen} contentContainerStyle={sw.container} bounces={false}>
        {/* HERO */}
        <View style={sw.heroSection}>
          {/* Dot-grid pattern overlay */}
          <View nativeID="salbom-hero-pattern-view" style={sw.heroPatternOverlay} pointerEvents="none" />
          {/* Floating tool icons — distribuidos por todo el ancho */}
          <Animated.Image source={WebCatIcon1} style={[sw.heroToolIcon, { width: 72, height: 72, top: 38, left: '8%',   opacity: 0.13, transform: [{ rotate: '-18deg' }, { scale: heroAccentScale }] }]} />
          <Animated.Image source={WebCatIcon2} style={[sw.heroToolIcon, { width: 58, height: 58, bottom: 52, left: '14%', opacity: 0.10, transform: [{ rotate: '10deg'  }] }]} />
          <Animated.Image source={WebCatIcon4} style={[sw.heroToolIcon, { width: 65, height: 65, top: 120, left: '22%',  opacity: 0.09, transform: [{ rotate: '25deg'  }, { scale: heroAccentScale }] }]} />
          <Animated.Image source={WebCatIcon3} style={[sw.heroToolIcon, { width: 60, height: 60, top: 30,  right: '12%', opacity: 0.11, transform: [{ rotate: '12deg'  }] }]} />
          <Animated.Image source={WebCatIcon5} style={[sw.heroToolIcon, { width: 55, height: 55, bottom: 45, right: '8%', opacity: 0.10, transform: [{ rotate: '-8deg'  }, { scale: heroAccentScale }] }]} />
          <Animated.Image source={WebCatIcon6} style={[sw.heroToolIcon, { width: 68, height: 68, top: 160, right: '20%', opacity: 0.09, transform: [{ rotate: '-22deg' }] }]} />
          <Animated.Image source={WebCatIcon7} style={[sw.heroToolIcon, { width: 62, height: 62, bottom: 30, left: '38%', opacity: 0.08, transform: [{ rotate: '15deg'  }] }]} />
          {/* Flecha decorativa sobresaliendo desde el borde derecho, detrás del producto */}
          <View style={sw.heroArrowWrap} pointerEvents="none">
            <FlechaBannerSvg width={560} height={532} />
          </View>
          {/* Animated shimmer beams */}
          <Animated.View
            pointerEvents="none"
            style={[sw.heroShimmerBeam, {
              transform: [
                { rotate: '-25deg' },
                { translateX: heroShimmerX.interpolate({ inputRange: [0, 1], outputRange: [-400, windowWidth + 500] }) },
              ],
            }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[sw.heroShimmerBeam2, {
              transform: [
                { rotate: '-25deg' },
                { translateX: heroShimmerX.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-700, windowWidth, windowWidth + 700] }) },
              ],
            }]}
          />
          <View style={sw.heroContent}>
            <View style={sw.heroTextCol}>
              <Text style={sw.heroTitle}>MAQUINAS Y{"\n"}HERRAMIENTAS</Text>
              <Text style={sw.heroBody}>Con más de 50 años en el mercado argentino, ofrecemos herramientas y maquinarias para el sector ferretero a un precio competitivo y con el mejor asesoramiento y servicio postventa.</Text>
              <Pressable style={({ hovered }: any) => [sw.outlineBtnLight, webTrans, hovered && sw.outlineBtnLightHover]} onPress={() => go('Maquinaria para Taller')}>
                <Text style={sw.outlineBtnLightText}>CONOCÉ MÁS</Text>
              </Pressable>
            </View>
            <Pressable
              style={sw.heroImgCol}
              onHoverIn={() => { heroHoverRef.current = true; }}
              onHoverOut={() => { heroHoverRef.current = false; }}
            >
              <View style={sw.heroGlowWrap} pointerEvents="none">
                <Animated.View style={[sw.heroGlowLayer1, { opacity: heroAccentOpacity.interpolate({ inputRange: [0.35, 1], outputRange: [0.10, 0.22] }) }]} />
                <View style={sw.heroGlowLayer2} />
              </View>
              <Animated.View
                style={[
                  sw.heroBadgeInner,
                  {
                    opacity: heroProductOpacity,
                    transform: [{ scale: heroProductScale }, { translateY: heroProductTranslateY }],
                  },
                ]}
              >
                {currentItem ? (
                  heroBgCache[currentItem.img] ? (
                    // Fondo ya removido (PNG transparente en memoria): el producto flota
                    // libre sobre el glow, sin necesidad de recortarlo en círculo.
                    <Image source={{ uri: heroProductSrc }} style={sw.heroProductImgClean} contentFit="contain" />
                  ) : (
                    // Mientras procesa la IA (o si falló): recorte circular prolijo
                    // como fallback, para no mostrar el recuadro blanco de la foto.
                    <View style={sw.heroProductCircle}>
                      <Image source={{ uri: currentItem.img }} style={sw.heroProductImg} contentFit="contain" />
                    </View>
                  )
                ) : (
                  <>
                    <Text style={sw.heroBadgeNumber}>50+</Text>
                    <Text style={sw.heroBadgeLabel}>AÑOS EN EL{"\n"}MERCADO</Text>
                  </>
                )}
              </Animated.View>
              {currentItem && (
                <Animated.View style={[sw.heroProductNameWrap, { opacity: heroProductOpacity }]}>
                  <Text style={sw.heroProductName} numberOfLines={2}>{(currentItem.name || '').toUpperCase()}</Text>
                  {currentItem.sku ? <Text style={sw.heroProductSku}>{currentItem.sku}</Text> : null}
                </Animated.View>
              )}
              {featuredList.length > 1 && (
                <View style={sw.heroProductDots}>
                  {featuredList.map((_, i) => (
                    <Pressable key={i} onPress={() => advanceHeroProduct(i)}>
                      <View style={[sw.heroProductDot, i === currentIndex && sw.heroProductDotActive]} />
                    </Pressable>
                  ))}
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* BENEFICIOS */}
        <View nativeID="sb-rv-beneficios" style={sw.beneficiosRow}>
          <View style={sw.beneficioCard}><View style={sw.beneficioIconCircle}><CartCardSvg width={40} height={40} /></View><View><Text style={sw.beneficioTitle}>ARMÁ TU PROPIO PEDIDO</Text><Text style={sw.beneficioDesc}>Cotizá, comprá y elegí los productos que estabas buscando</Text></View></View>
          <View style={sw.beneficioCard}><View style={sw.beneficioIconCircle}><UserCardSvg width={40} height={40} /></View><View><Text style={sw.beneficioTitle}>ATENCIÓN EN VIVO</Text><Text style={sw.beneficioDesc}>Hablá con un representante de ventas en vivo a través de la intranet</Text></View></View>
          <View style={sw.beneficioCard}><View style={sw.beneficioIconCircle}><CCardSvg width={40} height={40} /></View><View><Text style={sw.beneficioTitle}>MÉTODOS DE PAGO</Text><Text style={sw.beneficioDesc}>Conocé nuestras condiciones de pago.</Text></View></View>
          <View style={sw.beneficioCard}><View style={sw.beneficioIconCircle}><ComCardSvg width={40} height={40} /></View><View><Text style={sw.beneficioTitle}>COMUNIDAD SAL-BOM</Text><Text style={sw.beneficioDesc}>Ingrese a la comunidad para estar siempre actualizado.</Text></View></View>
        </View>

        {/* SAL-BOM MINORISTA */}
        <View nativeID="sb-rv-minorista" style={sw.minoristaRow}>
          <View style={sw.minoristaTextCol}>
            <Text style={sw.minoristaTitle}>SAL-BOM{"\n"}MINORISTA</Text>
            <Text style={sw.minoristaDesc}>Conocé a las marcas que acompañan en el día a día al grupo Sal-Bom S.R.L, todas estas marcas podés encontrarlas en nuestro local minorista.</Text>
            <Pressable style={({ hovered }: any) => [sw.outlineBtnLight, webTrans, hovered && sw.outlineBtnLightHover]} onPress={openMinoristaLink}>
              <Text style={sw.outlineBtnLightText}>CONOCÉ MÁS</Text>
            </Pressable>
          </View>
          <View style={sw.minoristaImgCol}>
            <Image source={WebPhotoMinorista} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />
          </View>
        </View>

        {/* CATEGORÍAS — carrusel horizontal con flechas (desktop usa mouse, no swipe) */}
        <View nativeID="sb-rv-categorias" style={sw.categoriasSection}>
          <View style={sw.categoriasInner}>
            <Text style={sw.categoriasTitle}>CATEGORÍAS</Text>
            <View style={sw.categoriasCarouselWrap}>
              <Pressable style={({ hovered }: any) => [sw.categoriasArrow, webTrans, hovered && sw.categoriasArrowHover]} onPress={() => scrollCategorias(-1)}>
                <Ionicons name="chevron-back" size={20} color="#2B2B2B" />
              </Pressable>
              <ScrollView
                ref={categoriasScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={sw.categoriasRow}
                contentContainerStyle={{ gap: 16 }}
                onScroll={(e) => { categoriasScrollX.current = e.nativeEvent.contentOffset.x; }}
                scrollEventThrottle={32}
              >
                {WEB_CATEGORIES.map((cat, idx) => (
                  <Pressable key={idx} style={({ hovered }: any) => [sw.categoriaBox, webTrans, hovered && sw.categoriaBoxHover]} onPress={() => go(cat.keyword)}>
                    <Image source={cat.icon} style={{ width: 64, height: 64 }} contentFit="contain" />
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={({ hovered }: any) => [sw.categoriasArrow, webTrans, hovered && sw.categoriasArrowHover]} onPress={() => scrollCategorias(1)}>
                <Ionicons name="chevron-forward" size={20} color="#2B2B2B" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* NOSOTROS */}
        <View nativeID="sb-rv-nosotros" style={sw.nosotrosRow}>
          <View style={sw.nosotrosImgCol}>
            <Image source={WebPhotoNosotros} style={[StyleSheet.absoluteFillObject, { filter: 'grayscale(55%)' }] as any} contentFit="cover" />
            {/* Filtro azul de marca (la foto anterior venía azulada de origen) */}
            <View style={sw.nosotrosImgOverlay} />
          </View>
          <View style={sw.nosotrosRightCol}>
            <View style={sw.nosotrosBadgesRow}>
              <View style={sw.nosotrosBadgeGray}><Text style={sw.nosotrosBadgeGrayText}>NOSOTROS</Text></View>
              <View style={sw.nosotrosBadgeDark}><Text style={sw.nosotrosBadgeDarkSmall}>DESDE</Text><Text style={sw.nosotrosBadgeDarkBig}>1971</Text></View>
            </View>
            <View style={sw.nosotrosTextPad}>
              <Text style={sw.nosotrosHeadline}>Sal-Bom abre sus puertas en 1971 en la localidad de San Telmo</Text>
              <Text style={sw.nosotrosBody}>Contamos con una larga trayectoria en la comercialización de máquinas y herramientas en el mercado argentino. Para la industria ferretera ofrecemos diversidad de productos de gran calidad y servicio postventa garantizado.</Text>
            </View>
          </View>
        </View>

        {/* NOTICIAS */}
        <View nativeID="sb-rv-noticias" style={sw.noticiasRow}>
          <View style={sw.noticiasLeftCol}>
            <Text style={sw.noticiasTitle}>NOTICIAS</Text>
          </View>
          <View style={sw.noticiasImgCol}>
            <Image source={WebPhotoNoticias} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />
            <View style={sw.noticiasGradientOverlay} />
            <View style={sw.noticiasTextBox}>
              <Text style={sw.noticiasHeadline}>SERVICIO POSTVENTA: ¿POR QUÉ ES IMPORTANTE?</Text>
              <Text style={sw.noticiasBody}>Queremos que experiencia de compra sea la mejor, es por eso que brindamos un servicio postventa de todas las marcas que representamos. Todos los productos cuentan con garantía de fabrica</Text>
            </View>
          </View>
        </View>

        {/* NEWSLETTER */}
        <View nativeID="sb-rv-newsletter" style={sw.newsletterSection}>
          <Text style={sw.newsletterTitle}>¡UNITE A NUESTRA COMUNIDAD!</Text>
          <Text style={sw.newsletterSubtitle}>Enteráte de todas nuestras novedades y beneficios exclusivos para vos.</Text>
          <View style={sw.newsletterRow}>
            <TextInput
              placeholder="Tu correo electrónico"
              placeholderTextColor="#B3B3B3"
              style={sw.newsletterInput}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Pressable style={({ hovered }: any) => [sw.newsletterBtn, webTrans, hovered && sw.newsletterBtnHover, loadingNews && { opacity: 0.7 }]} onPress={handleSubscribe} disabled={loadingNews}>
              <Text style={sw.newsletterBtnText}>{loadingNews ? 'ENVIANDO...' : 'SUSCRIBIRSE'}</Text>
            </Pressable>
          </View>
        </View>

        {/* DISTRIBUIDORES */}
        <View nativeID="sb-rv-distribuidores" style={sw.distribuidoresRow}>
          <View style={sw.distribuidoresLeft}>
            <Text style={sw.distribuidoresText}>SOMOS DISTRIBUIDORES{"\n"}OFICIALES DE</Text>
          </View>
          <View style={sw.distribuidoresRight}>
            <ShimuraDestacadoSvg width={220} height={80} />
          </View>
        </View>

        {/* FOOTER */}
        <View style={sw.footer}>
          <View style={sw.footerInner}>
            <View style={sw.footerCol}>
              <Text style={sw.footerHeading}>Categorías</Text>
              <Pressable onPress={() => navigation.navigate('MainTabs')}><Text style={sw.footerLink}>Inicio</Text></Pressable>
              <Pressable onPress={() => go('')}><Text style={sw.footerLink}>Productos</Text></Pressable>
              <Text style={sw.footerLink}>Servicio Técnico</Text>
              <Text style={sw.footerLink}>Ofertas</Text>
              <Text style={sw.footerLink}>Nosotros</Text>
              <Text style={sw.footerLink}>Contacto</Text>
            </View>
            <View style={sw.footerCol}>
              <Text style={sw.footerHeading}>Contacto</Text>
              <Text style={sw.footerLink}>11-3275-5880 / 5899</Text>
              <Text style={sw.footerLink}>4207-4667 / 4544</Text>
              <Text style={sw.footerLink}>administracion@sal-bom.com.ar</Text>
            </View>
            <View style={sw.footerCol}>
              <Text style={sw.footerHeading}>Mi cuenta</Text>
              <Pressable onPress={() => navigation.navigate('MainTabs', { screen: 'Perfil' })}><Text style={sw.footerLink}>Mi perfil</Text></Pressable>
              <Text style={sw.footerLink}>Adhoc</Text>
              <Text style={sw.footerLink}>Acceso rápido</Text>
              <Text style={sw.footerLink}>Ajustes</Text>
            </View>
            <View style={sw.footerCol}>
              <Text style={sw.footerHeading}>Atención al cliente</Text>
              <Text style={sw.footerLink}>08:30 a 17:30 hs</Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
      <Modal visible={showPopup} transparent animationType="none" onRequestClose={closePopup}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalContent, { transform: [{ scale: popupScale }] }]}>
            <TouchableOpacity style={s.closeBtn} onPress={closePopup}>
              <Ionicons name="close" size={28} color="#1C9BD8" />
            </TouchableOpacity>
            <FlatList
              data={popupSlides}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              initialNumToRender={1}
              windowSize={2}
              removeClippedSubviews={true}
              renderItem={renderPopupSlide}
              style={{ flex: 1, width: '100%' }}
            />
            {popupSlides.length > 1 && (
              <View style={s.paginationDots}>
                {popupSlides.map((_, i) => (
                  <View key={i} style={[s.pDot, { backgroundColor: '#1C9BD8', opacity: 0.5 }]} />
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
      </>
    );
  }

  return (
    <>
    <Animated.ScrollView
        style={s.screen} 
        contentContainerStyle={s.container} 
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16} 
        removeClippedSubviews={true}
    >
      <View style={s.heroWrap}>
        <View style={s.heroFrame}>
          <View style={s.heroImgBox}>
            <VideoView player={player} style={{ width: HERO_W, height: HERO_IMG_H }} contentFit="cover" nativeControls={false} />
          </View>
          {/* OPTIMIZACIÓN: renderToHardwareTextureAndroid para SVGs estáticos gigantes */}
          <View pointerEvents="none" style={{ position: 'absolute', right: -70, top: 190 }} renderToHardwareTextureAndroid={true} shouldRasterizeIOS={true}>
              <VectorHomeSvg width={296} height={270} preserveAspectRatio="xMidYMid meet" />
          </View>
        </View>
        <View style={s.heroTextWrap}>
          <Text style={s.heroTitle}>MAQUINAS Y{"\n"}HERRAMIENTAS</Text>
          <Text style={s.heroBody}>Con más de 50 años en el mercado argentino, ofrecemos herramientas y maquinarias para el sector ferretero a un precio competitivo y con el mejor asesoramiento y servicio postventa.</Text>
        </View>
      </View>

      <View style={[s.headerRow, { marginLeft: -25 }]} renderToHardwareTextureAndroid={true}>
        <FlechaCategoriaSvg width={115} height={36} preserveAspectRatio="xMidYMid meet" />
        <Text style={s.headerTitle}>CATEGORÍAS</Text>
      </View>
      
      {/* SECCIÓN CATEGORÍAS (Usando constantes fijas) */}
      <View style={{ marginTop: 20, height: CATS_STACK_H }}>
        <ScrollRevealItem scrollY={scrollY} sectionY={CATS_SECTION_Y_FIXED} itemY={0} direction="right" style={{ position: 'absolute', top: 0, right: -16, zIndex: 10, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Maquinaria para Taller')} style={{flex:1}}><CatTallerComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={CATS_SECTION_Y_FIXED} itemY={70} direction="left" style={{ position: 'absolute', top: 70, left: -16, zIndex: 9, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Maquinaria para Jardín')} style={{flex:1}}><CatJardinComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={CATS_SECTION_Y_FIXED} itemY={140} direction="right" style={{ position: 'absolute', top: 140, right: -16, zIndex: 8, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Bombas, Filtros y Motobombas')} style={{flex:1}}><CatBombasComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={CATS_SECTION_Y_FIXED} itemY={210} direction="left" style={{ position: 'absolute', top: 210, left: -16, zIndex: 7, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Grupos y Motores')} style={{flex:1}}><CatGruposComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={CATS_SECTION_Y_FIXED} itemY={280} direction="right" style={{ position: 'absolute', top: 280, right: -16, zIndex: 6, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Aceites')} style={{flex:1}}><CatAccesoriosComp /></Pressable>
        </ScrollRevealItem>
      </View>

      <View style={s.featuredWrap}>
        <View style={{ position: 'absolute', top: 22, left: 12, zIndex: 2 }} renderToHardwareTextureAndroid={true}>
            <ProductosDestacadosSvg width={SCREEN_W - 24} height={120} preserveAspectRatio="xMidYMid meet" />
        </View>
        {currentItem && (
            <Animated.View key={currentItem.id} style={{ flex: 1, opacity: contentOpacity, zIndex: 4 }}>
                <View style={s.featuredInfoContainer}>
                    <View style={s.featuredInfoLeft}><Text style={s.featuredCatLabel}>CATEGORÍA</Text><Text style={s.featuredCatValue} numberOfLines={2}>{currentItem.cat ? currentItem.cat.toUpperCase() : ''}</Text></View>
                    <View style={s.featuredInfoRight}>{currentItem.sku ? <Text style={s.featuredSku}>{currentItem.sku}</Text> : null}<Text style={s.featuredName} numberOfLines={3}>{currentItem.name ? currentItem.name.toUpperCase() : ''}</Text></View>
                </View>
                <View style={s.featuredImgContainer}><Image source={{ uri: currentItem.img }} style={s.featuredImg} contentFit="contain" cachePolicy="memory-disk" transition={200} /></View>
            </Animated.View>
        )}
        <View style={{ position: 'absolute', bottom: -3, left: 0, zIndex: 1 }} renderToHardwareTextureAndroid={true}>
            <FondoDestacadoSvg width={SCREEN_W} height={167} preserveAspectRatio="xMidYMid meet" />
        </View>
        {featuredList.length > 0 && (
            <>
                <Animated.View style={{ position: 'absolute', right: 10, bottom: 95, zIndex: 12, transform: [{ scale: mouseScale }] }}>
                   <Pressable onPressIn={handleMousePressIn} onPressOut={handleMousePressOut} onPress={handleMousePress}><MouseSvg width={240} height={85} preserveAspectRatio="xMidYMid meet" /></Pressable>
                </Animated.View>
                <Animated.View style={[s.sliderGroupContainer, { transform: [{ translateX }, { translateY: pan.y }], opacity: buttonOpacity }]} {...panResponder.panHandlers}>
                    {(isShimura || isIssei) && (<View style={{ marginRight: 50 }}>{isShimura ? <ShimuraDestacadoSvg width={140} height={55} preserveAspectRatio="xMidYMid meet" /> : <IsseiDestacadoSvg width={120} height={55} preserveAspectRatio="xMidYMid meet" />}</View>)}
                    <DeslizaSvg width={130} height={45} preserveAspectRatio="xMidYMid meet" />
                </Animated.View>
                <View style={s.dotsContainer}>{featuredList.map((_, idx) => <View key={idx} style={[s.dot, idx === currentIndex && s.dotActive]} />)}</View>
            </>
        )}
      </View>

      <View style={s.nosotrosWrap}>
        <View style={s.nosotrosRibbon}>
          <ScrollRevealItem scrollY={scrollY} sectionY={NOSOTROS_SECTION_Y_FIXED} itemY={0} direction="left" style={s.nosotrosLeft}><Text style={s.nosotrosTitle}>NOSOTROS</Text></ScrollRevealItem>
          <ScrollRevealItem scrollY={scrollY} sectionY={NOSOTROS_SECTION_Y_FIXED} itemY={0} direction="right" style={s.nosotrosRight}><Text style={s.nosotrosDesde}>DESDE</Text><Text style={s.nosotrosYear}>1971</Text></ScrollRevealItem>
        </View>
        <Image source={NosotrosFoto} style={{ width: SCREEN_W, height: 215, marginTop: 0 }} contentFit="cover" cachePolicy="memory-disk" />
        <View style={{ paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 28, color: '#2B2B2B' }}>SAL-BOM ABRE SUS PUERTAS{"\n"}EN 1971 EN LA LOCALIDAD DE{"\n"}SAN TELMO</Text>
          <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: '#4A4A4A' }}>Contamos con una larga trayectoria en la comercialización de máquinas y herramientas en el mercado argentino. Para la industria ferretera ofrecemos diversidad de productos de gran calidad y servicio postventa garantizado.</Text>
        </View>
      </View>

      <View style={s.cardsWrap} renderToHardwareTextureAndroid={true}>
        <View style={s.card}><View style={s.cardIconCircle}><CartCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>ARMÁ TU PROPIO PEDIDO</Text><Text style={s.cardDesc}>Cotizá, comprá y elegí los productos que estabas buscando</Text></View></View>
        <View style={s.card}><View style={s.cardIconCircle}><UserCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>ATENCIÓN EN VIVO</Text><Text style={s.cardDesc}>Hablá con un representante de ventas en vivo a través de la intranet</Text></View></View>
        <View style={s.card}><View style={s.cardIconCircle}><CCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>MÉTODOS DE PAGO</Text><Text style={s.cardDesc}>Conocé nuestras condiciones de pago.</Text></View></View>
        <View style={s.card}><View style={s.cardIconCircle}><ComCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>COMUNIDAD SAL-BOM</Text><Text style={s.cardDesc}>Ingrese a la comunidad para estar siempre actualizado.</Text></View></View>
      </View>

      <View style={s.minoristaWrap}>
        <Image source={MinoristaImg} style={{ width: SCREEN_W, height: 210 }} contentFit="cover" cachePolicy="memory-disk" />
        <View style={s.minoristaLower}>
          <Text style={s.minoristaTitle}>SAL-BOM MINORISTA</Text>
          <Text style={s.minoristaDesc}>Conocé a las marcas que acompañan en el día a día al grupo Sal-Bom S.R.L, todas estas marcas podés encontrarlas en nuestro local minorista.</Text>
          <TouchableOpacity style={s.minoristaBtn} onPress={openMinoristaLink}>
            <Text style={s.minoristaBtnText}>CONOCÉ MÁS</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.newsWrap}>
        <Text style={s.newsTitle}>¡UNITE A{"\n"}NUESTRA COMUNIDAD!</Text>
        <Text style={s.newsSubtitle}>Enterate de todas nuestras novedades y beneficios{"\n"}exclusivos para vos.</Text>
        <TextInput 
            placeholder="Tu correo electrónico" 
            placeholderTextColor="#9CA3AF" 
            style={s.newsInput} 
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
        />
        <TouchableOpacity 
            style={[s.newsBtn, loadingNews && { opacity: 0.7 }]} 
            onPress={handleSubscribe}
            disabled={loadingNews}
        >
            <Text style={s.newsBtnText}>{loadingNews ? "ENVIANDO..." : "SUSCRIBIRSE"}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 100 }} />
    </Animated.ScrollView>

    <Modal visible={showPopup} transparent animationType="none" onRequestClose={closePopup}>
        <View style={s.modalOverlay}>
            <Animated.View style={[s.modalContent, { transform: [{ scale: popupScale }] }]}>
                <TouchableOpacity style={s.closeBtn} onPress={closePopup}>
                    <Ionicons name="close" size={28} color="#1C9BD8" />
                </TouchableOpacity>
                <FlatList
                    data={popupSlides}
                    keyExtractor={(_, i) => String(i)}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    initialNumToRender={1}
                    windowSize={2}
                    removeClippedSubviews={true}
                    renderItem={renderPopupSlide}
                    style={{ flex: 1, width: '100%' }}
                />
                {popupSlides.length > 1 && (
                    <View style={s.paginationDots}>
                        {popupSlides.map((_, i) => (
                            <View key={i} style={[s.pDot, { backgroundColor: '#1C9BD8', opacity: 0.5 }]} />
                        ))}
                    </View>
                )}
            </Animated.View>
        </View>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingTop: 0, paddingBottom: 16 }, 
  heroWrap: { paddingBottom: 18 },
  heroFrame: { width: HERO_W, height: HERO_IMG_H, position: 'relative' },
  heroImgBox: { width: '100%', height: '100%', overflow: 'hidden' },
  heroTextWrap: { paddingHorizontal: PAD_X },
  heroTitle: { marginTop: 22, fontSize: 59, lineHeight: 54, color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold' },
  heroBody: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#4A4A4A' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 0 },
  headerTitle: { fontSize: 38, letterSpacing: 0.6, color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold', marginLeft: -10 },
  featuredWrap: { height: 640, backgroundColor: '#1C9BD8', position: 'relative', paddingTop: 130 },
  featuredInfoContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 10, marginTop: 16, zIndex: 5 },
  featuredInfoLeft: { flex: 1, alignItems: 'flex-start', marginRight: 10 },
  featuredInfoRight: { flex: 1.2, alignItems: 'flex-end', marginLeft: 10 },
  featuredCatLabel: { fontFamily: 'BarlowCondensed-Regular', color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2, letterSpacing: 1 },
  featuredCatValue: { fontFamily: 'BarlowCondensed-Bold', color: '#FFFFFF', fontSize: 26, lineHeight: 28 }, 
  featuredSku: { fontFamily: 'BarlowCondensed-Regular', color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 4 },
  featuredName: { fontFamily: 'BarlowCondensed-Bold', color: '#FFFFFF', fontSize: 20, lineHeight: 22, textAlign: 'right' },
  featuredImgContainer: { position: 'absolute', top: 100, left: 0, right: 0, height: 250, zIndex: 3, alignItems: 'center', justifyContent: 'center', paddingRight: 40 },
  featuredImg: { width: '100%', height: '100%' },
  sliderGroupContainer: { position: 'absolute', bottom: 40, right: 25, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  dotsContainer: { position: 'absolute', bottom: 20, right: 25, width: 130, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 15 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 3 },
  dotActive: { backgroundColor: '#FFFFFF', width: 8, height: 8, borderRadius: 4 },
  nosotrosWrap: { backgroundColor: '#FFFFFF' },
  nosotrosRibbon: { width: SCREEN_W - 2, height: 172, alignSelf: 'center', flexDirection: 'row' },
  nosotrosLeft: { flex: 2, backgroundColor: '#222222', justifyContent: 'center', paddingLeft: 14, marginLeft: -1, marginTop: -1, alignItems: 'center' },
  nosotrosRight:{ flex: 1, backgroundColor: '#1C9BD8', justifyContent: 'center', alignItems: 'center', marginRight: -1 },
  nosotrosTitle:{ fontFamily: 'BarlowCondensed-Bold', fontSize: 48, color: '#FFFFFF' },
  nosotrosDesde:{ fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: -6 },
  nosotrosYear: { fontFamily: 'BarlowCondensed-Bold', fontSize: 52, color: '#FFFFFF' },
  cardsWrap: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, backgroundColor: '#FFFFFF' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C9BD8', borderRadius: 80, paddingVertical: 14, paddingRight: 16, marginBottom: 14 },
  cardIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', marginLeft: 10, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  cardTextBox: { flex: 1 },
  cardTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF' },
  cardDesc: { marginTop: 2, fontSize: 12, lineHeight: 16, color: '#FFFFFF' },
  minoristaWrap: { backgroundColor: '#FFFFFF' },
  minoristaLower: { backgroundColor: '#313131', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 28, alignItems: 'center', marginTop: -46 },
  minoristaTitle:{ fontFamily: 'BarlowCondensed-Bold', fontSize: 36, color: '#FFFFFF', letterSpacing: 0.5, textAlign: 'center' },
  minoristaDesc: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#DDE3EA', textAlign: 'center' },
  minoristaBtn: { marginTop: 20, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 26, borderRadius: 28, borderWidth: 3, borderColor: '#FFFFFF' },
  minoristaBtnText:{ fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: 1 },
  newsWrap: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 28 },
  newsTitle: { textAlign: 'center', color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold', fontSize: 40, lineHeight: 42 },
  newsSubtitle: { textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 18, color: '#4A4A4A' },
  newsInput: { marginTop: 16, height: 46, borderRadius: 10, backgroundColor: '#EDEDED', paddingHorizontal: 16, fontSize: 16, color: '#111111' },
  newsBtn: { marginTop: 16, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 28, borderRadius: 28, borderWidth: 3, borderColor: '#1C9BD8' },
  newsBtnText: { color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold', fontSize: 18, letterSpacing: 1 },

  // --- ESTILOS POPUP ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: POPUP_W, height: POPUP_H, alignItems: 'center', justifyContent: 'center', marginBottom: 50, marginRight: 20 },
  closeBtn: { position: 'absolute', top: 90, right: 40, zIndex: 10, backgroundColor: 'rgba(230,249,255,0.9)', borderRadius: 20, padding: 5 },
  slideContainer: { width: POPUP_W, height: POPUP_H, alignItems: 'center', justifyContent: 'center' },
  popupTextContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: 110, paddingLeft: 55, paddingRight: 35 },
  popupDate: { fontFamily: 'BarlowCondensed-Regular', fontSize: 18, color: '#1C9BD8', marginBottom: 4 },
  popupTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 62, lineHeight: 58, color: '#1C9BD8', textAlign: 'center', marginBottom: 25 },
  popupBodyTitle: { alignSelf: 'flex-start', fontFamily: 'BarlowCondensed-Regular', fontSize: 15, color: '#444', marginBottom: 8 },
  popupBody: { fontFamily: 'BarlowCondensed-Regular', fontSize: 15, color: '#444', lineHeight: 20, textAlign: 'left', marginBottom: 15 },
  popupPrice: { fontFamily: 'BarlowCondensed-Bold', fontSize: 90, color: '#1C9BD8', marginBottom: 20 },
  popupFooter: { fontFamily: 'BarlowCondensed-Regular', fontSize: 12, color: '#555', lineHeight: 14, textAlign: 'left' },
  newArrivalsContent: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  productsScrollWrapper: { width: '100%', height: 350 },
  productSlide: { width: POPUP_W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  productImg: { width: 220, height: 220, marginBottom: 20 },
  productName: { fontFamily: 'BarlowCondensed-Bold', fontSize: 24, color: '#2B2B2B', textAlign: 'center', marginBottom: 5 },
  productSku: { fontFamily: 'BarlowCondensed-Regular', fontSize: 16, color: '#666', marginBottom: 15 },
  verBtn: { backgroundColor: '#1C9BD8', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 25 },
  verBtnText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  swipeIndicator: { position: 'absolute', bottom: 60, alignSelf: 'center' },
  paginationDots: { position: 'absolute', bottom: -20, flexDirection: 'row', gap: 8 },
  pDot: { width: 8, height: 8, borderRadius: 4 }
});

// ============================================================================
// ESTILOS DESKTOP WEB — calcados del diseño Figma "Pagina Salbom" (1440px)
// Colores exactos: azul #1C9BD8, negros #1E1E1E/#232323/#313131/#4E4E4E,
// fondo footer #555554, gris claro #D4D4D4, input #EBEBEB.
// ============================================================================
const WEB_BLUE = '#1C9BD8';
const WEB_DARK1 = '#1E1E1E';
const WEB_DARK2 = '#232323';
const WEB_DARKGRAY = '#313131';
const WEB_MIDGRAY = '#4E4E4E';
const WEB_FOOTERBG = '#555554';
const WEB_LIGHTGRAY = '#D4D4D4';
const WEB_INPUTBG = '#EBEBEB';
const WEB_RAILGRAY = '#636363';
const WEB_MAXW = 1440;

// Transición CSS para los hovers (react-native-web la traduce a transition real)
const webTrans: any = { transitionProperty: 'all', transitionDuration: '180ms' };

const sw = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { alignItems: 'center', paddingBottom: 0 },

  // HERO — fondo oscuro full-bleed con animación; el contenido se centra a 1440
  heroSection: { width: '100%', minHeight: 700, backgroundColor: '#111827', overflow: 'hidden', position: 'relative' },
  heroPatternOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  heroToolIcon: { position: 'absolute', zIndex: 1 },
  heroShimmerBeam: { position: 'absolute', top: -200, bottom: -200, width: 260, backgroundColor: 'rgba(255,255,255,0.025)', zIndex: 1 },
  heroShimmerBeam2: { position: 'absolute', top: -200, bottom: -200, width: 90, backgroundColor: 'rgba(28,155,216,0.07)', zIndex: 1 },
  heroArrowWrap: { position: 'absolute', right: -130, top: '50%', marginTop: -266, opacity: 0.16, zIndex: 1 },
  heroContent: { width: '100%', flexDirection: 'row', maxWidth: WEB_MAXW, alignSelf: 'center', paddingHorizontal: 54, paddingTop: 60, gap: 40, position: 'relative', zIndex: 5 },
  heroTextCol: { flex: 1, justifyContent: 'center', maxWidth: 620 },
  heroTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 80, lineHeight: 76, color: '#FFFFFF' },
  heroBody: { fontFamily: 'Rubik', fontSize: 16, lineHeight: 22, color: 'rgba(255,255,255,0.72)', marginTop: 20, maxWidth: 500 },
  heroImgCol: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 500 },
  heroPhoto: { width: 480, height: 424 },
  heroGlowWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroGlowLayer1: { position: 'absolute', width: 620, height: 620, borderRadius: 310, backgroundColor: WEB_BLUE },
  heroGlowLayer2: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: 'rgba(28,155,216,0.10)' },
  heroBadgeInner: {
    minWidth: 260, minHeight: 260,
    marginTop: 40,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  // Recorte circular: el "recuadro" del fondo de la foto queda cortado por el
  // overflow:hidden, así que solo se ve un disco prolijo, sin bordes cuadrados.
  heroProductCircle: {
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: '#EAF3FA',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 16,
  },
  heroBadgeNumber: { fontFamily: 'BarlowCondensed-Bold', fontSize: 110, lineHeight: 100, color: WEB_BLUE },
  heroBadgeLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', textAlign: 'center', letterSpacing: 2, marginTop: 4 },
  heroProductImg: { width: 260, height: 260 },
  heroProductImgClean: { width: 360, height: 360 },
  heroProductNameWrap: { marginTop: 4, alignItems: 'center', paddingHorizontal: 8, maxWidth: 420 },
  heroProductName: { fontFamily: 'BarlowCondensed-Bold', fontSize: 24, color: 'rgba(255,255,255,0.92)', textAlign: 'center', letterSpacing: 1.5, textTransform: 'uppercase' },
  heroProductSku: { fontFamily: 'Rubik', fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', letterSpacing: 1, marginTop: 5 },
  heroProductDots: { flexDirection: 'row', gap: 7, marginTop: 14, alignItems: 'center' },
  heroProductDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroProductDotActive: { width: 22, height: 7, borderRadius: 4, backgroundColor: WEB_BLUE },
  outlineBtnDark: { marginTop: 28, alignSelf: 'flex-start', borderWidth: 2, borderColor: WEB_MIDGRAY, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 28 },
  outlineBtnDarkText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: WEB_MIDGRAY, letterSpacing: 1 },
  outlineBtnLight: { marginTop: 28, alignSelf: 'flex-start', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 24, paddingVertical: 10, paddingHorizontal: 28 },
  outlineBtnLightHover: { backgroundColor: 'rgba(255,255,255,0.14)', transform: [{ translateY: -2 }] },
  outlineBtnLightText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#FFFFFF', letterSpacing: 1 },

  // PRODUCTOS DESTACADOS

  // BENEFICIOS
  beneficiosRow: { width: '100%', maxWidth: WEB_MAXW, flexDirection: 'row', paddingHorizontal: 60, paddingVertical: 40, justifyContent: 'space-between' },
  beneficioCard: { flexDirection: 'row', alignItems: 'center', flex: 1, marginHorizontal: 10, maxWidth: 300 },
  beneficioIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  beneficioTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: WEB_BLUE },
  beneficioDesc: { fontFamily: 'Rubik', fontSize: 12, lineHeight: 16, color: WEB_DARKGRAY, marginTop: 4, maxWidth: 190 },

  // MINORISTA — fila full-bleed (cada columna llega al borde real de la pantalla);
  // el texto se limita con maxWidth en minoristaDesc, no en el contenedor.
  minoristaRow: { width: '100%', flexDirection: 'row', minHeight: 365 },
  minoristaTextCol: { flex: 1, backgroundColor: WEB_DARK1, padding: 54, justifyContent: 'center' },
  minoristaTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 64, lineHeight: 60, color: '#FFFFFF' },
  minoristaDesc: { fontFamily: 'Rubik', fontSize: 15, lineHeight: 20, color: '#FFFFFF', marginTop: 16, maxWidth: 480 },
  minoristaImgCol: { flex: 1, position: 'relative', overflow: 'hidden' },
  minoristaImgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },

  // CATEGORÍAS — banda full-bleed, contenido interno centrado a 1440
  categoriasSection: { width: '100%', backgroundColor: WEB_LIGHTGRAY, paddingVertical: 30 },
  categoriasInner: { width: '100%', maxWidth: WEB_MAXW, alignSelf: 'center', paddingHorizontal: 54, flexDirection: 'row', alignItems: 'center', gap: 32 },
  categoriasTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 48, color: WEB_DARKGRAY, flexShrink: 0 },
  categoriasCarouselWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  categoriasRow: { flexGrow: 0 },
  categoriaBox: { width: 100, height: 100, backgroundColor: '#FFFFFF', borderRadius: 4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  categoriaBoxHover: { transform: [{ translateY: -4 }], shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  categoriasArrow: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, flexShrink: 0,
  },
  categoriasArrowHover: { backgroundColor: '#EFEFEF', transform: [{ scale: 1.1 }] },

  // NOSOTROS — fila full-bleed, badges ocupan todo el ancho de la columna derecha
  nosotrosRow: { width: '100%', flexDirection: 'row', minHeight: 580 },
  nosotrosImgCol: { flex: 1, position: 'relative', overflow: 'hidden' },
  nosotrosImgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(24,110,175,0.5)' },
  nosotrosRightCol: { flex: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  nosotrosBadgesRow: { flexDirection: 'row' },
  nosotrosBadgeGray: { flex: 2, backgroundColor: WEB_MIDGRAY, paddingVertical: 64, alignItems: 'center', justifyContent: 'center' },
  nosotrosBadgeGrayText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 40, color: '#FFFFFF' },
  nosotrosBadgeDark: { flex: 1, backgroundColor: WEB_DARK1, paddingVertical: 64, alignItems: 'center', justifyContent: 'center' },
  nosotrosBadgeDarkSmall: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#FFFFFF' },
  nosotrosBadgeDarkBig: { fontFamily: 'BarlowCondensed-Bold', fontSize: 42, color: '#FFFFFF' },
  nosotrosTextPad: { padding: 54, paddingTop: 28, paddingBottom: 36 },
  nosotrosHeadline: { fontFamily: 'Rubik', fontWeight: '700', fontSize: 20, lineHeight: 24, color: WEB_DARKGRAY },
  nosotrosBody: { fontFamily: 'Rubik', fontSize: 15, lineHeight: 20, color: WEB_DARKGRAY, marginTop: 10 },

  // NOTICIAS — fila full-bleed
  noticiasRow: { width: '100%', flexDirection: 'row', minHeight: 325 },
  noticiasLeftCol: { flex: 1, backgroundColor: WEB_BLUE, alignItems: 'center', justifyContent: 'center' },
  noticiasTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 56, color: '#FFFFFF' },
  noticiasImgCol: { flex: 2.15, position: 'relative', overflow: 'hidden', justifyContent: 'flex-end' },
  noticiasGradientOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,20,20,0.55)' },
  noticiasTextBox: { padding: 40, maxWidth: 620 },
  noticiasHeadline: { fontFamily: 'BarlowCondensed-Bold', fontSize: 32, lineHeight: 36, color: '#FFFFFF' },
  noticiasBody: { fontFamily: 'Rubik', fontSize: 14, lineHeight: 18, color: '#FFFFFF', marginTop: 10 },

  // NEWSLETTER
  newsletterSection: { width: '100%', maxWidth: WEB_MAXW, alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  newsletterTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 64, lineHeight: 66, color: WEB_BLUE, textAlign: 'center' },
  newsletterSubtitle: { fontFamily: 'Rubik', fontWeight: '700', fontSize: 16, color: WEB_DARKGRAY, marginTop: 12, textAlign: 'center' },
  newsletterRow: { flexDirection: 'row', marginTop: 24, gap: 12 },
  newsletterInput: { width: 480, height: 50, borderRadius: 14, backgroundColor: WEB_INPUTBG, paddingHorizontal: 20, fontSize: 16, color: '#111111' },
  newsletterBtn: { height: 50, borderRadius: 14, backgroundColor: WEB_BLUE, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' },
  newsletterBtnHover: { backgroundColor: '#1787BC' },
  newsletterBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: 0.5 },

  // DISTRIBUIDORES — fila full-bleed
  distribuidoresRow: { width: '100%', flexDirection: 'row', minHeight: 150 },
  distribuidoresLeft: { flex: 1, backgroundColor: WEB_BLUE, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 40 },
  distribuidoresText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 44, lineHeight: 44, color: '#FFFFFF', textAlign: 'right' },
  distribuidoresRight: { flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },

  // FOOTER — banda full-bleed, columnas centradas a 1440
  footer: { width: '100%', backgroundColor: WEB_FOOTERBG, paddingVertical: 40 },
  footerInner: { width: '100%', maxWidth: WEB_MAXW, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 70, gap: 60 },
  footerCol: { gap: 8 },
  footerHeading: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 6 },
  footerLink: { fontFamily: 'Rubik', fontSize: 13, color: '#D9D9D9' },
});

