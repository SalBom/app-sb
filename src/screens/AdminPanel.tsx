// src/screens/AdminPanel.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// Auth, assets y SVGs
import { getCuitFromStorage, getUserProfile } from '../utils/authStorage';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';
import BackfillIAModal from '../components/BackfillIAModal';
import MasterboxAdminModal from '../components/MasterboxAdminModal';

const AvatarPlaceholder = require('../../assets/avatarPlaceholder.png');

interface UserState {
  name: string;
  image: string | null | undefined;
}

const MenuRow = ({ label, isSubItem = false, hasArrow = true, onPress, badge }: any) => (
  <TouchableOpacity onPress={onPress} style={[styles.menuRow, isSubItem && styles.menuRowSub]}>
    <Text style={[styles.menuText, isSubItem && styles.menuTextSub]}>{label}</Text>
    {hasArrow && <Ionicons name="chevron-forward" size={isSubItem ? 18 : 22} color={isSubItem ? "#999" : "#333"} />}
    {badge && <View>{badge}</View>}
  </TouchableOpacity>
);

const AdminCardD = ({ icon, label, sub, onPress }: { icon: any; label: string; sub?: string; onPress: () => void }) => (
  <TouchableOpacity style={dStyles.card} onPress={onPress} activeOpacity={0.85}>
    <View style={dStyles.cardIconWrap}>
      <Ionicons name={icon} size={20} color="#1C9BD8" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={dStyles.cardLabel}>{label}</Text>
      {sub ? <Text style={dStyles.cardSub}>{sub}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={18} color="#B5B5B5" />
  </TouchableOpacity>
);

export default function AdminPanel() {
  const navigation = useNavigation<any>();
  const isDesktopWeb = useIsDesktopWeb();

  const [user, setUser] = useState<UserState>({ name: 'USUARIO', image: null });
  const [backfillVisible, setBackfillVisible] = useState(false);
  const [masterboxVisible, setMasterboxVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const cuit = await getCuitFromStorage();
      if (cuit) {
        const p = await getUserProfile(cuit);
        if (p) setUser({ name: p.name || 'USUARIO', image: p.image_128 });
      }
    })();
  }, []);

  const nameParts = (user.name || 'ADMIN').trim().split(/\s+/);
  const nameLine1 = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ').toUpperCase() : nameParts[0].toUpperCase();
  const nameLine2 = nameParts.length > 1 ? nameParts[nameParts.length - 1].toUpperCase() : '';

  const hasImage = user.image && typeof user.image === 'string';
  const avatarSource = hasImage
    ? { uri: (user.image as string).startsWith('data:') ? user.image : `data:image/png;base64,${user.image}` }
    : AvatarPlaceholder;

  if (isDesktopWeb) {
    return (
      <View style={dStyles.screen}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <View style={dStyles.page}>
            <Text style={dStyles.pageTitle}>PANEL DE ADMIN</Text>
            <Text style={dStyles.subtitle}>Hola, {[nameLine1, nameLine2].filter(Boolean).join(' ')}</Text>

            <View style={dStyles.grid}>
              <AdminCardD icon="person-outline" label="Gestión de usuarios" onPress={() => navigation.navigate('GestionUsuarios')} />
              <AdminCardD icon="megaphone-outline" label="Promociones" onPress={() => navigation.navigate('AdminPromociones')} />
              <AdminCardD icon="stats-chart-outline" label="Vista de estadísticas" sub="Monitoreo de vendedores" onPress={() => navigation.navigate('DashboardAdministrador')} />
            </View>

            <Text style={dStyles.sectionTitle}>CONFIGURACIÓN</Text>
            <View style={dStyles.grid}>
              <AdminCardD icon="cash-outline" label="Plazos de pagos y descuentos" onPress={() => navigation.navigate('AdminPlazos')} />
              <AdminCardD icon="pricetag-outline" label="Marcas" onPress={() => {}} />
              <AdminCardD icon="image-outline" label="Banners" onPress={() => navigation.navigate('AdminBanners')} />
              <AdminCardD icon="sparkles-outline" label="Fichas con IA (lote)" sub="Completar atributos automáticamente" onPress={() => setBackfillVisible(true)} />
              <AdminCardD icon="cube-outline" label="Masterbox" sub="Productos que se venden por caja" onPress={() => setMasterboxVisible(true)} />
            </View>
          </View>
        </ScrollView>
        <BackfillIAModal visible={backfillVisible} onClose={() => setBackfillVisible(false)} />
        <MasterboxAdminModal visible={masterboxVisible} onClose={() => setMasterboxVisible(false)} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} bounces={false}>
      
      {/* HEADER */}
      <View style={styles.titleRow}>
        <FlechaHeaderSvg width={60} height={40} style={{ marginLeft: -10 }} /> 
        <Text style={styles.pageTitle}>PANEL DE ADMIN</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* TARJETA DE PERFIL */}
      <View style={styles.profileCard}>
        <View style={styles.avatarContainer}>
          <Image source={avatarSource} style={styles.avatar} />
          <View style={styles.cameraIconBg}>
             <Ionicons name="camera" size={14} color="#FFF" />
          </View>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.uName1}>{nameLine1}</Text>
          <Text style={styles.uName2}>{nameLine2}</Text>
        </View>
      </View>

      {/* MENÚ DE OPCIONES */}
      <View style={styles.menuCard}>
        
        <TouchableOpacity 
          style={styles.mainMenuItem}
          onPress={() => navigation.navigate('GestionUsuarios')} 
        >
           <Ionicons name="person-outline" size={22} color="#333" style={{ marginRight: 10 }} />
           <Text style={styles.mainMenuText}>GESTIÓN DE USUARIOS</Text>
           <Ionicons name="chevron-forward" size={22} color="#333" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <View style={styles.configSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name="settings-outline" size={22} color="#333" style={{ marginRight: 10 }} />
                <Text style={styles.mainMenuText}>CONFIGURACIÓN DE</Text>
            </View>
            
            <View style={{ paddingLeft: 10 }}>
                {/* --- CAMBIO AQUÍ: Nombre y Navegación --- */}
                <MenuRow 
                    label="PLAZOS DE PAGOS Y DESCUENTOS" 
                    isSubItem 
                    onPress={() => navigation.navigate('AdminPlazos')} 
                />
                
                <MenuRow label="MARCAS" isSubItem onPress={() => console.log('Marcas')} />
                <MenuRow label="BANNERS" isSubItem onPress={() => navigation.navigate('AdminBanners')} />
            </View>
        </View>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.mainMenuItem} onPress={() => navigation.navigate('AdminPromociones')}>
           <Ionicons name="megaphone-outline" size={22} color="#333" style={{ marginRight: 10 }} />
           <Text style={styles.mainMenuText}>PROMOCIONES</Text>
           <Ionicons name="chevron-forward" size={22} color="#333" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity 
           style={styles.mainMenuItem} 
           activeOpacity={0.7}
           onPress={() => navigation.navigate('DashboardAdministrador')}
        >
           <Ionicons name="stats-chart-outline" size={22} color="#333" style={{ marginRight: 10 }} />
           <View>
             <Text style={styles.mainMenuText}>VISTA DE ESTADÍSTICAS</Text>
             <Text style={[styles.proxText, { color: '#666', marginTop: 0 }]}>Monitoreo de vendedores</Text>
           </View>
           <Ionicons name="chevron-forward" size={22} color="#333" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.mainMenuItem} onPress={() => setBackfillVisible(true)}>
           <Ionicons name="sparkles-outline" size={22} color="#7C3AED" style={{ marginRight: 10 }} />
           <View>
             <Text style={styles.mainMenuText}>FICHAS CON IA (LOTE)</Text>
             <Text style={[styles.proxText, { color: '#666', marginTop: 0 }]}>Completar atributos automáticamente</Text>
           </View>
           <Ionicons name="chevron-forward" size={22} color="#333" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.mainMenuItem} onPress={() => setMasterboxVisible(true)}>
           <Ionicons name="cube-outline" size={22} color="#B45309" style={{ marginRight: 10 }} />
           <View>
             <Text style={styles.mainMenuText}>MASTERBOX</Text>
             <Text style={[styles.proxText, { color: '#666', marginTop: 0 }]}>Productos que se venden por caja</Text>
           </View>
           <Ionicons name="chevron-forward" size={22} color="#333" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

      </View>

      <BackfillIAModal visible={backfillVisible} onClose={() => setBackfillVisible(false)} />
      <MasterboxAdminModal visible={masterboxVisible} onClose={() => setMasterboxVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 20, paddingHorizontal: 0 },
  pageTitle: { fontSize: 28, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', letterSpacing: 0.5, marginLeft: 5 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center', marginLeft: 15 },
  profileCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 30, marginBottom: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#DDD', borderWidth: 3, borderColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: {width:0, height:2} },
  cameraIconBg: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#333', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  userInfo: { marginLeft: 20 },
  uName1: { fontSize: 18, fontFamily: 'BarlowCondensed-Regular', color: '#333' },
  uName2: { fontSize: 30, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', lineHeight: 30 },
  menuCard: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 5 }, elevation: 3, marginBottom: 20 },
  mainMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  mainMenuText: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', letterSpacing: 0.5 },
  configSection: { paddingVertical: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  menuRowSub: { paddingVertical: 8 },
  menuText: { fontSize: 16, fontFamily: 'BarlowCondensed-Medium', color: '#333' },
  menuTextSub: { fontSize: 15, fontFamily: 'BarlowCondensed-Regular', color: '#555' },
  separator: { height: 1, backgroundColor: '#F0F0F0' },
  proxText: { fontSize: 11, fontFamily: 'BarlowCondensed-Bold', color: '#139EDB', marginTop: 2, letterSpacing: 0.5 }
});

// --- Estilos exclusivos de desktop ---
const dStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  page: { width: '100%', paddingHorizontal: 40, paddingTop: 30 },
  pageTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 44, color: '#2B2B2B', textTransform: 'uppercase' },
  subtitle: { fontFamily: 'Rubik', fontSize: 15, color: '#8A8A8A', marginTop: 6, marginBottom: 30 },

  sectionTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#8A8A8A', letterSpacing: 1, marginTop: 40, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  card: { width: 300, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#ECECEC', paddingVertical: 18, paddingHorizontal: 18 },
  cardIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#EAF6FC', alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  cardSub: { fontFamily: 'Rubik', fontSize: 12, color: '#139EDB', marginTop: 2 },
});