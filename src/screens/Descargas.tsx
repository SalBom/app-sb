import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';

// Título
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';

// Íconos de lista
import ListFlechaAzulSvg from '../../assets/ListFlechaAzul.svg';
import ListFlechaGrisSvg from '../../assets/ListFlechaGris.svg';
import IconDownloadSvg from '../../assets/IconDownload.svg';

// Hero / carrusel
const HeroImg = require('../../assets/carruselDescargas.jpeg'); // <--- CAMBIO 1: Nueva Imagen
import LogoShimuraCarruselSvg from '../../assets/logoShimuraCarrusel.svg';
import IsseiDescargasSvg from '../../assets/IsseiDescargas.svg'; // <--- CAMBIO 2: Importar Logo Issei
import ArrowCarruselSvg from '../../assets/arrowCarrusel.svg';

// --- CONFIGURACIÓN DE LINKS ---
const LINKS = {
  // Índice 0: SHIMURA
  shimura: {
    precios: 'https://drive.google.com/drive/folders/1Ucakkt8z-USgiWJtMO0PQ7QZabczUXZg?usp=drive_link',
    catalogo: 'https://drive.google.com/file/d/1pnrrzB4j3TtOYdKLYd2PbY7GnAWQ5gV_/view?usp=drive_link',
    repuestos: 'https://drive.google.com/file/d/1Q2ZHXtjUwAcwmKx9Yo_XsFLatMafKSH-/view?usp=drive_link',
    servicios: 'https://www.figma.com/proto/cWPdMOU6jWSGBchPGCdCeY/SERVICIOS-TECNICOS?page-id=0%3A1&node-id=71-3861&viewport=313%2C499%2C0.06&t=3YdWPdhBxHpijVSg-1&scaling=scale-down-width&content-scaling=fixed&starting-point-node-id=71%3A3861',
  },
  // Índice 1: ISSEI
  issei: {
    precios: 'https://drive.google.com/drive/folders/16h0rCUvLIJTzd28dQlioy-IQ6u1RtZUl?usp=drive_link',
    catalogo: '',
    repuestos: '',
    servicios: '',
  }
};

// --- DIMENSIONES Y ESTÉTICA ---
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ROW_H = 80; 

const PADDING_RIGHT = 15; 
const ITEM_WIDTH = SCREEN_WIDTH - PADDING_RIGHT; 

const CUT_SIZE = 20; 
const SHADOW_OFFSET = 4;
const BLUR_RADIUS = 3;
const SVG_PADDING = 10; 

// Path del SVG (Rectángulo con cortes a la derecha)
const cardPath = `
  M 0,0 
  H ${ITEM_WIDTH - CUT_SIZE} 
  L ${ITEM_WIDTH},${CUT_SIZE} 
  V ${ROW_H - CUT_SIZE} 
  L ${ITEM_WIDTH - CUT_SIZE},${ROW_H} 
  H 0 
  V 0 
  Z
`;

const HERO_SLIDES = [
  { id: 'shimura' }, // Slide 0
  { id: 'issei' },   // Slide 1
];

const ITEMS = [
  { id: 'precios', label: 'LISTA DE PRECIOS', left: 'blue' },
  { id: 'catalogo', label: 'CATÁLOGO', left: 'grey' },
  { id: 'repuestos', label: 'LISTA DE REPUESTOS', left: 'blue' },
  { id: 'servicios', label: 'SERVICIOS TÉCNICOS', left: 'grey' },
];

const Descargas: React.FC = () => {
  const navigation = useNavigation<any>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const heroScrollRef = useRef<ScrollView | null>(null);

  // --- LÓGICA DE APERTURA DE LINKS ---
  const onPressItem = async (id: string) => {
    // Determinamos la marca según el slide actual (0 o 1)
    const brandKey = currentIndex === 0 ? 'shimura' : 'issei';
    
    // Buscamos la URL correspondiente
    // @ts-ignore
    const url = LINKS[brandKey][id];

    if (url && url.length > 0) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          console.log(`No se puede abrir la URL: ${url}`);
        }
      } catch (error) {
        console.error("Error al abrir link:", error);
      }
    } else {
      console.log(`No hay link configurado para ${brandKey} - ${id}`);
    }
  };

  const handleMomentumEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x || 0;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handlePressNextSlide = () => {
    const nextIndex = 1;
    if (heroScrollRef.current) {
      heroScrollRef.current.scrollTo({
        x: nextIndex * SCREEN_WIDTH,
        y: 0,
        animated: true,
      });
    }
    setCurrentIndex(nextIndex);
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.container}
      bounces={false}
    >
      {/* Header de sección */}
      <View style={s.header}>
        <FlechaHeaderSvg width={60} height={36} />
        <Text style={s.title}>DESCARGAS</Text>
      </View>

      {/* HERO CARRUSEL */}
      <View style={s.heroWrap}>
        <ScrollView
          ref={heroScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {HERO_SLIDES.map((slide, index) => (
            <View key={slide.id} style={s.heroSlide}>
              <Image source={HeroImg} style={s.heroImg} resizeMode="cover" />
              
              {/* CAMBIO 3: Mostrar logo según el slide */}
              {/* Slide 0: SHIMURA */}
              {slide.id === 'shimura' && (
                <>
                  <View style={s.heroLogoCenter}>
                    <LogoShimuraCarruselSvg width={200} height={60} />
                  </View>
                  <TouchableOpacity
                    style={s.heroArrowRight}
                    activeOpacity={0.8}
                    onPress={handlePressNextSlide}
                  >
                    <ArrowCarruselSvg width={26} height={26} />
                  </TouchableOpacity>
                </>
              )}

              {/* Slide 1: ISSEI */}
              {slide.id === 'issei' && (
                <View style={s.heroLogoCenter}>
                    <IsseiDescargasSvg width={200} height={60} />
                </View>
              )}

            </View>
          ))}
        </ScrollView>
      </View>

      {/* Lista */}
      <View style={s.listWrap}>
        {ITEMS.map((it, idx) => (
          <View key={it.id} style={[s.itemWrapper, idx === ITEMS.length - 1 && { marginBottom: 20 }]}>
            
            {/* Fondo SVG */}
            <View style={s.svgContainer}>
                <Svg width={ITEM_WIDTH + SVG_PADDING * 2} height={ROW_H + SHADOW_OFFSET + SVG_PADDING * 2}>
                    <Defs>
                        <Filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                            <FeGaussianBlur in="SourceAlpha" stdDeviation={BLUR_RADIUS} />
                        </Filter>
                    </Defs>
                    <G transform={`translate(${SVG_PADDING}, ${SVG_PADDING})`}>
                        <Path d={cardPath} fill="rgba(0,0,0,0.15)" transform={`translate(0, ${SHADOW_OFFSET})`} filter="url(#shadow)" />
                        <Path d={cardPath} fill="#FFFFFF" />
                    </G>
                </Svg>
            </View>

            {/* Contenido */}
            <TouchableOpacity
              style={s.contentContainer}
              activeOpacity={0.8}
              onPress={() => onPressItem(it.id)}
            >
              <View style={s.rowLeft}>
                {it.left === 'blue' ? (
                  <ListFlechaAzulSvg width={32} height={28} />
                ) : (
                  <ListFlechaGrisSvg width={32} height={28} />
                )}
                <Text style={s.rowText} numberOfLines={1}>{it.label}</Text>
              </View>

              <View style={s.rowRight}>
                <IconDownloadSvg width={24} height={24} />
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    paddingBottom: 16,
  },

  /* ===== Header ===== */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    marginBottom: 8,
  },
  title: {
    marginLeft: 8,
    fontSize: 28,
    letterSpacing: 0.6,
    color: '#2B2B2B',
    fontFamily: 'BarlowCondensed-Bold',
  },

  /* ===== Hero ===== */
  heroWrap: {
    marginTop: 2,
    marginBottom: 20,
  },
  heroSlide: {
    width: SCREEN_WIDTH,
    height: 180,
    borderRadius: 2,
    overflow: 'hidden',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  heroLogoCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  heroArrowRight: {
    position: 'absolute', right: 24, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },

  /* ===== Lista ===== */
  listWrap: {
    width: '100%',
    alignItems: 'flex-start',
  },
  
  itemWrapper: {
    width: ITEM_WIDTH,
    height: ROW_H,
    marginBottom: 16,
    marginLeft: 0,
    justifyContent: 'center',
  },

  svgContainer: {
    position: 'absolute',
    top: -SVG_PADDING,
    left: -SVG_PADDING,
    zIndex: 0,
  },

  contentContainer: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1,
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowText: {
    marginLeft: 14,
    fontSize: 18, 
    color: '#2B2B2B',
    fontFamily: 'BarlowCondensed-Bold',
    flex: 1, 
  },
  rowRight: {
    paddingRight: 10,
  },
});

export default Descargas;