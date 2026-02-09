import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Image as RNImage, 
  TextInput,
  PanResponder,
  Pressable,
  Modal, 
  TouchableOpacity,
  FlatList,
  Linking, 
  Alert
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import axios from 'axios'; 
import { useVideoPlayer, VideoView } from 'expo-video';
import { API_URL } from '../config'; // <--- IMPORTACIÓN CENTRALIZADA

// SVGs
import FlechaCategoriaSvg from '../../assets/flechaCategoria.svg';
import VectorHomeSvg from '../../assets/vectorHome.svg';
import PoPTCbannerSvg from '../../assets/PoPTCbanner.svg'; 
import NuevoIngresoPopUPSvg from '../../assets/NuevoIngresoPopUP.svg'; 
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

// --- CONFIG POPUPS ---
const POPUP_W = Math.min(SCREEN_W * 0.95, 380); 
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
    player.play();
  });

  const [featuredList, setFeaturedList] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const featuredListRef = useRef<any[]>([]);
  const currentIndexRef = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [catsSectionY, setCatsSectionY] = useState(0);
  const [nosotrosSectionY, setNosotrosSectionY] = useState(0);

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

  useEffect(() => {
    fetchPopups(); 
  }, []);

  useEffect(() => {
    if (isFocused) {
      loadFeatured();
      if (player) player.play(); 
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
      Linking.openURL('https://share.google/9avSJoSckfq4iFjoZ').catch(() => {});
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

  return (
    <>
    <Animated.ScrollView 
        style={s.screen} 
        contentContainerStyle={s.container} 
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16} 
    >
      <View style={s.heroWrap}>
        <View style={s.heroFrame}>
          <View style={s.heroImgBox}>
            <VideoView player={player} style={{ width: HERO_W, height: HERO_IMG_H }} contentFit="cover" nativeControls={false} />
          </View>
          <VectorHomeSvg width={296} height={270} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', right: -70, top: 190 }} pointerEvents="none" />
        </View>
        <View style={s.heroTextWrap}>
          <Text style={s.heroTitle}>MAQUINAS Y{"\n"}HERRAMIENTAS</Text>
          <Text style={s.heroBody}>Con más de 50 años en el mercado argentino, ofrecemos herramientas y maquinarias para el sector ferretero a un precio competitivo y con el mejor asesoramiento y servicio postventa.</Text>
        </View>
      </View>

      <View style={[s.headerRow, { marginLeft: -25 }]}>
        <FlechaCategoriaSvg width={115} height={36} preserveAspectRatio="xMidYMid meet" />
        <Text style={s.headerTitle}>CATEGORÍAS</Text>
      </View>
      
      {/* SECCIÓN CATEGORÍAS */}
      <View style={{ marginTop: 20, height: CATS_STACK_H }} onLayout={(event) => setCatsSectionY(event.nativeEvent.layout.y)}>
        <ScrollRevealItem scrollY={scrollY} sectionY={catsSectionY} itemY={0} direction="right" style={{ position: 'absolute', top: 0, right: -16, zIndex: 10, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Maquinaria para Taller')} style={{flex:1}}><CatTallerComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={catsSectionY} itemY={70} direction="left" style={{ position: 'absolute', top: 70, left: -16, zIndex: 9, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Maquinaria para Jardín')} style={{flex:1}}><CatJardinComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={catsSectionY} itemY={140} direction="right" style={{ position: 'absolute', top: 140, right: -16, zIndex: 8, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Bombas, Filtros y Motobombas')} style={{flex:1}}><CatBombasComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={catsSectionY} itemY={210} direction="left" style={{ position: 'absolute', top: 210, left: -16, zIndex: 7, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Grupos y Motores')} style={{flex:1}}><CatGruposComp /></Pressable>
        </ScrollRevealItem>
        <ScrollRevealItem scrollY={scrollY} sectionY={catsSectionY} itemY={280} direction="right" style={{ position: 'absolute', top: 280, right: -16, zIndex: 6, width: SVG_W, height: SVG_H }}>
            <Pressable onPress={() => go('Aceites')} style={{flex:1}}><CatAccesoriosComp /></Pressable>
        </ScrollRevealItem>
      </View>

      <View style={s.featuredWrap}>
        <ProductosDestacadosSvg width={SCREEN_W - 24} height={120} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', top: 22, left: 12, zIndex: 2 }} />
        {currentItem && (
            <Animated.View key={currentItem.id} style={{ flex: 1, opacity: contentOpacity, zIndex: 4 }}>
                <View style={s.featuredInfoContainer}>
                    <View style={s.featuredInfoLeft}><Text style={s.featuredCatLabel}>CATEGORÍA</Text><Text style={s.featuredCatValue} numberOfLines={2}>{currentItem.cat ? currentItem.cat.toUpperCase() : ''}</Text></View>
                    <View style={s.featuredInfoRight}>{currentItem.sku ? <Text style={s.featuredSku}>{currentItem.sku}</Text> : null}<Text style={s.featuredName} numberOfLines={3}>{currentItem.name ? currentItem.name.toUpperCase() : ''}</Text></View>
                </View>
                <View style={s.featuredImgContainer}><Image source={{ uri: currentItem.img }} style={s.featuredImg} contentFit="contain" cachePolicy="memory-disk" transition={200} /></View>
            </Animated.View>
        )}
        <FondoDestacadoSvg width={SCREEN_W} height={167} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', bottom: -3, left: 0, zIndex: 1 }} />
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

      <View style={s.nosotrosWrap} onLayout={(event) => setNosotrosSectionY(event.nativeEvent.layout.y)}>
        <View style={s.nosotrosRibbon}>
          <ScrollRevealItem scrollY={scrollY} sectionY={nosotrosSectionY} itemY={0} direction="left" style={s.nosotrosLeft}><Text style={s.nosotrosTitle}>NOSOTROS</Text></ScrollRevealItem>
          <ScrollRevealItem scrollY={scrollY} sectionY={nosotrosSectionY} itemY={0} direction="right" style={s.nosotrosRight}><Text style={s.nosotrosDesde}>DESDE</Text><Text style={s.nosotrosYear}>1971</Text></ScrollRevealItem>
        </View>
        <RNImage source={NosotrosFoto} style={{ width: SCREEN_W, height: 215, marginTop: 0 }} resizeMode="cover" />
        <View style={{ paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 28, color: '#2B2B2B' }}>SAL-BOM ABRE SUS PUERTAS{"\n"}EN 1971 EN LA LOCALIDAD DE{"\n"}SAN TELMO</Text>
          <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: '#4A4A4A' }}>Contamos con una larga trayectoria en la comercialización de máquinas y herramientas en el mercado argentino. Para la industria ferretera ofrecemos diversidad de productos de gran calidad y servicio postventa garantizado.</Text>
        </View>
      </View>

      <View style={s.cardsWrap}>
        <View style={s.card}><View style={s.cardIconCircle}><CartCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>ARMÁ TU PROPIO PEDIDO</Text><Text style={s.cardDesc}>Cotizá, comprá y elegí los productos que estabas buscando</Text></View></View>
        <View style={s.card}><View style={s.cardIconCircle}><UserCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>ATENCIÓN EN VIVO</Text><Text style={s.cardDesc}>Hablá con un representante de ventas en vivo a través de la intranet</Text></View></View>
        <View style={s.card}><View style={s.cardIconCircle}><CCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>MÉTODOS DE PAGO</Text><Text style={s.cardDesc}>Conocé nuestras condiciones de pago.</Text></View></View>
        <View style={s.card}><View style={s.cardIconCircle}><ComCardSvg width={48} height={48} /></View><View style={s.cardTextBox}><Text style={s.cardTitle}>COMUNIDAD SAL-BOM</Text><Text style={s.cardDesc}>Ingrese a la comunidad para estar siempre actualizado.</Text></View></View>
      </View>

      <View style={s.minoristaWrap}>
        <RNImage source={MinoristaImg} style={{ width: SCREEN_W, height: 210 }} resizeMode="cover" />
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