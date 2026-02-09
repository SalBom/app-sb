import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, Modal, Pressable 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';

import { API_URL } from '../config';

type User = {
  id?: number;
  odoo_id?: number;
  name: string;
  email: string;
  cuit: string; 
  role?: string;
  created_at?: string;
  tipo_odoo?: string; // Nuevo campo para saber si es Portal o Interno
};

const ROLES = ['Cliente', 'Vendedor', 'Admin', 'Vendedor Black'];

const GestionUsuarios = () => {
  const navigation = useNavigation<any>();
  
  // Tabs: usuarios | solicitudes | odoo
  const [activeTab, setActiveTab] = useState<'usuarios' | 'solicitudes' | 'odoo'>('usuarios');
  
  const [dataList, setDataList] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isImporting, setIsImporting] = useState(false); // Para diferenciar si editamos o importamos

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setDataList([]);
    try {
      let res;
      if (activeTab === 'usuarios') {
        res = await axios.get(`${API_URL}/admin/users/all`);
      } else if (activeTab === 'solicitudes') {
        res = await axios.get(`${API_URL}/admin/users/pending`);
      } else {
        // Endpoint nuevo que trae TODOS (Portal + Internos)
        res = await axios.get(`${API_URL}/odoo-users`);
      }
      
      if (res.data) setDataList(res.data);
    } catch (e) {
      console.error(e);
      if (activeTab !== 'usuarios') Alert.alert('Error', 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await axios.post(`${API_URL}/admin/users/approve`, { id, role: 'Cliente' });
      Alert.alert('Éxito', 'Usuario aprobado');
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'No se pudo aprobar');
    }
  };

  // --- ABRIR MODAL ---
  const openRoleModal = (user: User, importing = false) => {
    setSelectedUser(user);
    setIsImporting(importing); 
    setModalVisible(true);
  };

  // --- GUARDAR ROL ---
  const handleChangeRole = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      if (isImporting) {
        // ALTA DE ODOO (Pre-asignar cualquier rol)
        await axios.post(`${API_URL}/admin/preasignar`, {
          email: selectedUser.email,
          cuit: selectedUser.cuit,
          name: selectedUser.name,
          role: newRole // Enviamos el rol elegido
        });
        Alert.alert('Éxito', `Usuario importado como ${newRole}`);
      } else {
        // EDICIÓN NORMAL
        if (!selectedUser.id) return;
        await axios.post(`${API_URL}/admin/users/role`, {
          id: selectedUser.id,
          role: newRole
        });
        Alert.alert('Éxito', 'Rol actualizado');
      }
      setModalVisible(false);
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'No se pudo realizar la operación');
    }
  };

  const renderItem = ({ item }: { item: User }) => {
    
    // TAB 1: USUARIOS
    if (activeTab === 'usuarios') {
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.cuit}>CUIT: {item.cuit || '---'}</Text>
                    <Text style={styles.role}>Rol: <Text style={{fontWeight:'bold'}}>{item.role || 'Cliente'}</Text></Text>
                    {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => openRoleModal(item, false)} style={styles.editBtn}>
                    <Feather name="edit-2" size={18} color="#555" />
                </TouchableOpacity>
            </View>
        );
    }

    // TAB 2: SOLICITUDES
    if (activeTab === 'solicitudes') {
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.cuit}>CUIT: {item.cuit}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                    <Text style={styles.date}>Solicitado: {item.created_at ? String(item.created_at).substring(0,10) : '--'}</Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => item.id && handleApprove(item.id)}>
                        <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                        <Text style={styles.approveText}>Aprobar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // TAB 3: IMPORTAR ODOO (NUEVA)
    if (activeTab === 'odoo') {
        const isInternal = item.tipo_odoo?.includes('Interno');
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.email}>{item.email || 'Sin email'}</Text>
                    <View style={{flexDirection:'row', gap:10, marginTop:4}}>
                        <Text style={styles.cuit}>ID: {item.odoo_id}</Text>
                        <Text style={[styles.role, {color: isInternal ? '#E67E22' : '#2980B9'}]}>
                            {item.tipo_odoo || 'Usuario'}
                        </Text>
                    </View>
                </View>
                {/* AL TOCAR "ALTA", ABRIMOS MODAL DE SELECCIÓN */}
                <TouchableOpacity onPress={() => openRoleModal(item, true)} style={[styles.approveBtn, { backgroundColor: '#1C9BD8' }]}>
                    <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                    <Text style={styles.approveText}>ALTA</Text>
                </TouchableOpacity>
            </View>
        );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <FlechaHeaderSvg width={24} height={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestión de Usuarios</Text>
        <View style={{width: 24}} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'usuarios' && styles.activeTab]} 
          onPress={() => setActiveTab('usuarios')}>
          <Text style={[styles.tabText, activeTab === 'usuarios' && styles.activeTabText]}>Usuarios</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'solicitudes' && styles.activeTab]} 
          onPress={() => setActiveTab('solicitudes')}>
          <Text style={[styles.tabText, activeTab === 'solicitudes' && styles.activeTabText]}>Solicitudes</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'odoo' && styles.activeTab]} 
          onPress={() => setActiveTab('odoo')}>
          <Text style={[styles.tabText, activeTab === 'odoo' && styles.activeTabText]}>Importar Odoo</Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color="#1C9BD8" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={dataList}
          keyExtractor={(item, index) => String(item.id || item.odoo_id || index)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No hay registros.</Text>}
        />
      )}

      {/* Modal Selección de Rol */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                    {isImporting ? 'Dar Alta y Asignar Rol' : 'Cambiar Rol'}
                </Text>
                <Text style={{textAlign:'center', marginBottom:15, color:'#666'}}>
                    Usuario: {selectedUser?.name}
                </Text>
                
                {ROLES.map(r => (
                    <TouchableOpacity 
                        key={r} 
                        style={[styles.roleOption, selectedUser?.role === r && !isImporting && styles.roleOptionSelected]}
                        onPress={() => handleChangeRole(r)}
                    >
                        <Text style={[styles.roleText, selectedUser?.role === r && !isImporting && styles.roleTextSelected]}>{r}</Text>
                        {selectedUser?.role === r && !isImporting && <Ionicons name="checkmark" size={20} color="#1C9BD8" />}
                    </TouchableOpacity>
                ))}
            </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { 
    height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingTop: 10 
  },
  headerTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#333' },
  backBtn: { padding: 5 },

  tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  activeTab: { borderBottomWidth: 3, borderBottomColor: '#1C9BD8' },
  tabText: { fontSize: 14, color: '#999', fontFamily: 'BarlowCondensed-SemiBold' },
  activeTabText: { color: '#1C9BD8' },

  card: { 
    flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 10, 
    marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: {width:0, height:2} 
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#333' },
  cuit: { fontSize: 13, color: '#666', marginTop: 2 },
  email: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 2 },
  role: { fontSize: 13, color: '#1C9BD8', marginTop: 4, fontFamily: 'BarlowCondensed-SemiBold' },
  date: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },

  actions: { marginLeft: 10, justifyContent: 'center' },
  approveBtn: { 
    backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', 
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'center'
  },
  approveText: { color: '#FFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold', marginLeft: 4 },
  editBtn: { padding: 10, backgroundColor: '#F3F4F6', borderRadius: 8, justifyContent: 'center', alignSelf: 'center' },

  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16, fontFamily: 'BarlowCondensed-Regular' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, marginBottom: 5, color: '#333', textAlign: 'center' },
  roleOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  roleOptionSelected: { backgroundColor: '#F0F9FF', marginHorizontal: -20, paddingHorizontal: 20 },
  roleText: { fontSize: 16, color: '#555' },
  roleTextSelected: { color: '#1C9BD8', fontWeight: 'bold' }
});

export default GestionUsuarios;