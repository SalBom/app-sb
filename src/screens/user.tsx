import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker'; 
import { Image } from 'expo-image'; 

// SVGs
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';

// Iconos
import MiDashboardSvg from '../../assets/miDashboard.svg';
import FavsSvg from '../../assets/favs.svg';
import DownloadIconSvg from '../../assets/downloadIcon.svg';
import FacturasSvg from '../../assets/facturas.svg';
import RecibosSvg from '../../assets/recibos.svg';
import InfoSvg from '../../assets/info.svg';
import CameraSvg from '../../assets/camera.svg';
import LogOutSvg from '../../assets/logOut.svg';

const AvatarPlaceholder = require('../../assets/avatarPlaceholder.png');

// Auth
import { getCuitFromStorage, getUserProfile, saveUserProfile } from '../utils/authStorage';

import { API_URL } from '../config';

/* --- Boundary Error --- */
class TinyBoundary extends React.Component<{ children: React.ReactNode }, { e?: any }> {
  state = { e: undefined as any };
  static getDerivedStateFromError(e: any) { return { e }; }
  componentDidCatch(e: any) { console.log('TinyBoundary caught:', e); }
  render() {
    if (this.state.e) return <View><Text>Error</Text></View>;
    return this.props.children;
  }
}

const DISABLE_SVGS = false;   
const DISABLE_FONTS = false;  

/* --- CONFIGURACIÓN DE SOMBRA --- */
const SHADOW_OFFSET = 6;  
const BLUR_RADIUS = 4;    
const SVG_PAD = 20;       

/* --- COMPONENTE DE FONDO CON SOMBRA REAL --- */
const ShapedCard = ({ children, style, onPress }: { children: React.ReactNode, style?: any, onPress?: () => void }) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  const w = layout.width;
  const h = layout.height;
  const k = 20; // Tamaño del corte

  // Path: Recto Izq -> Corte Arriba-Der -> Recto Der -> Corte Abajo-Der -> Cierre
  const pathData = `
    M 0 0 
    L ${w - k} 0 
    L ${w} ${k} 
    L ${w} ${h - k} 
    L ${w - k} ${h} 
    L 0 ${h} 
    Z
  `;

  return (
    <TouchableOpacity 
      activeOpacity={0.9} 
      onPress={onPress}
      style={[s.shapedCardContainer, style]}
      onLayout={onLayout}
      disabled={!onPress}
    >
      {w > 0 && h > 0 && (
        <View style={[StyleSheet.absoluteFill, { top: -SVG_PAD, left: -SVG_PAD, right: -SVG_PAD, bottom: -SVG_PAD, overflow: 'visible' }]}>
          <Svg width={w + SVG_PAD * 2} height={h + SVG_PAD * 2}>
            <Defs>
              <Filter id="shadowBlur" x="-50%" y="-50%" width="200%" height="200%">
                <FeGaussianBlur in="SourceGraphic" stdDeviation={BLUR_RADIUS} />
              </Filter>
            </Defs>
            
            <G transform={`translate(${SVG_PAD}, ${SVG_PAD})`}>
                {/* 1. SOMBRA */}
                <Path 
                    d={pathData} 
                    fill="#000000" 
                    opacity={0.15} 
                    transform={`translate(${SHADOW_OFFSET}, ${SHADOW_OFFSET})`} 
                    filter="url(#shadowBlur)" 
                />
                
                {/* 2. TARJETA BLANCA */}
                <Path 
                    d={pathData} 
                    fill="#FFFFFF" 
                    stroke="#F0F0F0" 
                    strokeWidth={1} 
                />
            </G>
          </Svg>
        </View>
      )}
      
      <View style={{ paddingRight: k }}> 
        {children}
      </View>
    </TouchableOpacity>
  );
};

// Tipo para el perfil
type PerfilResp = {
  name?: string;
  image_128?: string; 
  role?: string;      
};

export default function User() {
  const navigation = useNavigation<any>();
  const [perfil, setPerfil] = useState<PerfilResp | null>(null);
  const [useFallback, setUseFallback] = useState(false); 
  const [uploading, setUploading] = useState(false); 

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cuit = await getCuitFromStorage();
        if (!cuit) return;
        
        // Intentar cargar caché primero
        const cached = await getUserProfile(cuit);
        
        if (cached) {
            // Mostrar info cacheada mientras cargamos la fresca
            setPerfil({ name: cached.name, image_128: cached.image_128 || undefined }); 
        }

        // Fetch API Fresca (Importante para traer el rol nuevo)
        const res = await fetch(`${API_URL}/usuario-perfil?cuit=${encodeURIComponent(String(cuit))}`);
        const data = await res.json().catch(() => null);

        if (!alive || !res.ok || !data) return;

        const name = data.name ?? data.display_name ?? '';
        const image_128 = data.image_128 ?? null;
        const role = data.role ?? 'Cliente'; 

        // Actualizamos estado y caché
        if (name || image_128) {
          setPerfil({ name, image_128: image_128 || undefined, role });
          await saveUserProfile(cuit, name, image_128 || undefined);
        }
      } catch (e) { console.log(e); }
    })();
    return () => { alive = false; };
  }, []);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        uploadImage(result.assets[0].base64);
      }
    } catch {}
  };

  const uploadImage = async (base64Image: string) => {
    try {
      setUploading(true);
      const cuit = await getCuitFromStorage();
      if (!cuit) return;
      const res = await fetch(`${API_URL}/usuario-perfil/editar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cuit, image_128: base64Image })
      });
      if (res.ok) {
        setPerfil(prev => ({ ...prev, image_128: base64Image }));
        setUseFallback(false);
        await saveUserProfile(cuit, perfil?.name || '', base64Image);
        Alert.alert("Éxito", "Foto actualizada.");
      } else {
        Alert.alert("Error", "No se pudo actualizar.");
      }
    } catch {
        Alert.alert("Error", "Fallo de conexión.");
    } finally { setUploading(false); }
  };

  const avatarSource = useMemo(() => {
    if (useFallback) return AvatarPlaceholder;
    const raw = perfil?.image_128;
    if (!raw) return AvatarPlaceholder;
    return { uri: raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` };
  }, [perfil?.image_128, useFallback]);

  const [line1, line2] = useMemo(() => {
    const n = (perfil?.name || '').trim();
    if (!n) return ['USER', 'NAME'];
    const parts = n.split(/\s+/);
    return parts.length === 1 ? [parts[0].toUpperCase(), ''] : [parts.slice(0, -1).join(' ').toUpperCase(), parts[parts.length - 1].toUpperCase()];
  }, [perfil?.name]);

  return (
    <TinyBoundary>
      <ScrollView style={s.screen} contentContainerStyle={s.container} bounces={false}>
        
        {/* HEADER */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
             {DISABLE_SVGS ? null : <FlechaHeaderSvg width={60} height={36} preserveAspectRatio="xMidYMid meet" />}
          </TouchableOpacity>
          <Text style={s.headerTitle}>MI PERFIL</Text>
        </View>

        {/* PERFIL */}
        <View style={s.profileSection}>
          <View style={s.avatarContainer}>
            {uploading ? (
              <View style={[s.avatar, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="small" color="#00A8E8" />
              </View>
            ) : (
              <Image 
                source={avatarSource} 
                style={s.avatar} 
                contentFit="cover"
                transition={300}
                cachePolicy="memory-disk"
                onError={() => setUseFallback(true)} 
              />
            )}
            <TouchableOpacity style={s.cameraButton} onPress={pickImage}>
              {DISABLE_SVGS ? null : <CameraSvg width={24} height={21} />}
            </TouchableOpacity>
          </View>

          <View style={s.userInfo} key={perfil?.name || 'placeholder'}>
            <Text style={[s.userName, DISABLE_FONTS && { fontFamily: undefined }]}>{line1}</Text>
            <Text style={[s.userLastName, DISABLE_FONTS && { fontFamily: undefined }]}>{line2}</Text>
            
            {/* ETIQUETA ROL */}
            <View style={[s.roleTag, !perfil?.role && { minWidth: 60, justifyContent: 'center' }]}>
                {perfil?.role ? (
                    <Text style={s.roleText}>{perfil.role}</Text>
                ) : (
                    <ActivityIndicator size="small" color="#999" style={{ transform: [{ scale: 0.8 }] }} />
                )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -4 }}>
              <TouchableOpacity style={s.editButton} onPress={() => navigation.navigate('EditUser')}>
                <Text style={[s.editButtonText, DISABLE_FONTS && { fontFamily: undefined }]}>EDITAR PERFIL</Text>
              </TouchableOpacity>
              
              {/* BOTÓN PANEL ADMIN: Chequeo robusto de 'Admin' */}
              {perfil?.role && perfil.role.toUpperCase() === 'ADMIN' && (
                  <TouchableOpacity 
                    style={[s.editButton, { backgroundColor: '#313131' }]} 
                    onPress={() => navigation.navigate('AdminPanel')}
                  >
                    <Text style={[s.editButtonText, DISABLE_FONTS && { fontFamily: undefined }]}>
                        PANEL ADMIN
                    </Text>
                  </TouchableOpacity>
              )}

            </View>
          </View>
        </View>

        {/* MENU DE OPCIONES */}
        <ShapedCard style={s.menuCard}>
            <MenuOption 
                icon={<MiDashboardSvg width={28} height={28} />} 
                label="MI DASHBOARD" 
                onPress={() => navigation.navigate('TableroVendedor')} 
            />
            <View style={s.separator} />

            <MenuOption 
                icon={<FavsSvg width={28} height={28} />} 
                label="MIS FAVORITOS" 
                onPress={() => navigation.navigate('Favoritos')} 
            />
            <View style={s.separator} />

            <MenuOption 
                icon={<DownloadIconSvg width={28} height={28} />} 
                label="DESCARGAS" 
                onPress={() => navigation.navigate('Descargas')} 
            />
            <View style={s.separator} />

            <MenuOption 
                icon={<FacturasSvg width={28} height={28} />} 
                label="MIS FACTURAS" 
                onPress={() => navigation.navigate('FacturasVendedor')} 
            />
            <View style={s.separator} />

            <MenuOption 
                icon={<RecibosSvg width={28} height={28} />} 
                label="RECIBOS" 
                onPress={() => {}} 
            />
            <View style={s.separator} />

            <MenuOption 
                icon={<InfoSvg width={28} height={28} />} 
                label="INFORMACIÓN" 
                onPress={() => {}} 
            />
        </ShapedCard>

        {/* BOTON CERRAR SESIÓN */}
        <ShapedCard 
            style={s.logoutCard}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {DISABLE_SVGS ? null : <LogOutSvg width={28} height={28} />}
              <Text style={[s.logoutText, DISABLE_FONTS && { fontFamily: undefined }]}>CERRAR SESIÓN</Text>
            </View>
        </ShapedCard>

        <View style={{ height: 100 }} />
      </ScrollView>
    </TinyBoundary>
  );
}

const MenuOption = ({ icon, label, onPress }: any) => (
    <TouchableOpacity style={s.option} onPress={onPress}>
        <View style={s.optionLeft}>
            {!DISABLE_SVGS && icon}
            <Text style={[s.optionText, DISABLE_FONTS && { fontFamily: undefined }]}>{label}</Text>
        </View>
        <Text style={s.optionArrow}>›</Text>
    </TouchableOpacity>
);

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingTop: 10, paddingBottom: 16 },
  
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerTitle: { marginLeft: 8, fontSize: 28, letterSpacing: 0.6, color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold' },
  
  profileSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#E0E0E0' },
  cameraButton: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#4A4A4A', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  userInfo: { marginLeft: 20, flex: 1 },
  userName: { fontSize: 20, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },
  
  userLastName: { fontSize: 20, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginBottom: 4 }, 
  
  // ETIQUETA ROL
  roleTag: {
      backgroundColor: '#EEEEEE',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      alignSelf: 'flex-start',
      marginBottom: 10,
      height: 24, 
      justifyContent: 'center', 
  },
  roleText: {
      fontSize: 12,
      fontFamily: 'BarlowCondensed-Bold',
      color: '#616161',
      textTransform: 'uppercase',
      letterSpacing: 0.5
  },

  editButton: { backgroundColor: '#00A8E8', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, alignSelf: 'flex-start' },
  editButtonText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold' },

  // --- CONTENEDOR DE FORMA ---
  shapedCardContainer: {
    marginLeft: 14,     
    marginRight: 14,    
    marginTop: 10,
    marginBottom: 24, // Margen para la sombra
    paddingVertical: 12,
    paddingLeft: 20,
    backgroundColor: 'transparent',
  },

  menuCard: {},

  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  optionLeft: { flexDirection: 'row', alignItems: 'center' },
  optionText: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginLeft: 16 },
  optionArrow: { fontSize: 28, color: '#2B2B2B', marginTop: -4 },
  separator: { height: 1, backgroundColor: '#F0F0F0', width: '100%' },

  logoutCard: {
    paddingVertical: 20,
  },
  logoutText: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#E74C3C', marginLeft: 16 },
});