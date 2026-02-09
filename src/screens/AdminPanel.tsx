// src/screens/AdminPanel.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// Auth, assets y SVGs
import { getCuitFromStorage, getUserProfile } from '../utils/authStorage';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg'; 

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

export default function AdminPanel() {
  const navigation = useNavigation<any>();
  
  const [user, setUser] = useState<UserState>({ name: 'USUARIO', image: null });

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

      </View>

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