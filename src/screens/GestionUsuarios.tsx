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
  tipo_odoo?: string;
};

const ROLES = ['Cliente', 'Vendedor', 'Admin', 'Vendedor Black'];

const GestionUsuarios = () => {
  const navigation = useNavigation<any>();
  
  // 3 PESTAÑAS ACTIVAS
  const [activeTab, setActiveTab] = useState<'usuarios' | 'solicitudes' | 'odoo'>('usuarios');
  const [dataList, setDataList] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => { fetchData(); }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setDataList([]);
    try {
      let res;
      if (activeTab === 'usuarios') res = await axios.get(`${API_URL}/admin/users/all`);
      else if (activeTab === 'solicitudes') res = await axios.get(`${API_URL}/admin/users/pending`);
      else res = await axios.get(`${API_URL}/odoo-users`); // Llama al endpoint optimizado
      
      if (res.data) setDataList(res.data);
    } catch (e) {
      if (activeTab !== 'usuarios') Alert.alert('Error', 'No se pudieron cargar los datos.');
    } finally { setLoading(false); }
  };

  const handleApprove = async (id: number) => {
    try {
      await axios.post(`${API_URL}/admin/users/approve`, { id, role: 'Cliente' });
      Alert.alert('Éxito', 'Aprobado');
      fetchData();
    } catch (e) { Alert.alert('Error', 'Falló aprobación'); }
  };

  const openRoleModal = (user: User, importing = false) => {
    setSelectedUser(user);
    setIsImporting(importing); 
    setModalVisible(true);
  };

  const handleChangeRole = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      if (isImporting) {
        // Llama a preasignar
        await axios.post(`${API_URL}/admin/preasignar`, {
          email: selectedUser.email, cuit: selectedUser.cuit,
          name: selectedUser.name, role: newRole 
        });
        Alert.alert('Listo', `Rol asignado. ${selectedUser.name} aparecerá en el Dashboard.`);
      } else {
        // Edición normal
        if (!selectedUser.id) return;
        await axios.post(`${API_URL}/admin/users/role`, { id: selectedUser.id, role: newRole });
        Alert.alert('Éxito', 'Rol actualizado');
      }
      setModalVisible(false);
      fetchData();
    } catch (e) { Alert.alert('Error', 'No se pudo guardar'); }
  };

  const renderItem = ({ item }: { item: User }) => {
    if (activeTab === 'usuarios') {
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.cuit}>{item.cuit || '---'}</Text>
                    <Text style={styles.role}>{item.role || 'Cliente'}</Text>
                </View>
                <TouchableOpacity onPress={() => openRoleModal(item, false)} style={styles.editBtn}>
                    <Feather name="edit-2" size={18} color="#555" />
                </TouchableOpacity>
            </View>
        );
    }
    if (activeTab === 'solicitudes') {
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.cuit}>Pendiente</Text>
                    <Text style={styles.date}>{item.email}</Text>
                </View>
                <TouchableOpacity style={styles.approveBtn} onPress={() => item.id && handleApprove(item.id)}>
                    <Text style={styles.approveText}>Aprobar</Text>
                </TouchableOpacity>
            </View>
        );
    }
    // PESTAÑA ODOO
    if (activeTab === 'odoo') {
        const isInternal = item.tipo_odoo === 'Interno';
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <View style={{flexDirection:'row', gap:8, marginTop:2}}>
                        <Text style={[styles.badge, {color: isInternal ? '#E67E22':'#1C9BD8'}]}>
                            {item.tipo_odoo}
                        </Text>
                        <Text style={styles.cuit}>{item.cuit || 'Sin CUIT'}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => openRoleModal(item, true)} style={styles.actionBtn}>
                    <Text style={styles.actionText}>ASIGNAR ROL</Text>
                </TouchableOpacity>
            </View>
        );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><FlechaHeaderSvg width={24}/></TouchableOpacity>
        <Text style={styles.headerTitle}>Gestión Usuarios</Text>
        <View style={{width:24}}/>
      </View>

      <View style={styles.tabContainer}>
        {['usuarios', 'solicitudes', 'odoo'].map((t: any) => (
            <TouchableOpacity key={t} style={[styles.tab, activeTab===t && styles.activeTab]} onPress={()=>setActiveTab(t)}>
                <Text style={[styles.tabText, activeTab===t && styles.activeTabText]}>
                    {t === 'odoo' ? 'Usuarios Odoo' : t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
            </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color="#1C9BD8" style={{marginTop:20}}/> :
        <FlatList data={dataList} renderItem={renderItem} contentContainerStyle={{padding:15}}/>
      }

      <Modal visible={modalVisible} transparent onRequestClose={()=>setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={()=>setModalVisible(false)}>
            <Pressable style={styles.modalContent}>
                <Text style={styles.modalTitle}>{isImporting ? 'Asignar Rol (Pre-alta)' : 'Cambiar Rol'}</Text>
                {ROLES.map(r => (
                    <TouchableOpacity key={r} style={styles.roleOption} onPress={()=>handleChangeRole(r)}>
                        <Text style={styles.roleText}>{r}</Text>
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
  header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#EEE' },
  headerTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#333' },
  tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#EEE' },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  activeTab: { borderBottomWidth: 3, borderColor: '#1C9BD8' },
  tabText: { color: '#999', fontFamily: 'BarlowCondensed-SemiBold' },
  activeTabText: { color: '#1C9BD8' },
  card: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2 },
  info: { flex: 1 },
  name: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#333' },
  cuit: { fontSize: 13, color: '#666' },
  role: { fontSize: 13, color: '#1C9BD8', fontWeight: 'bold' },
  date: { fontSize: 12, color: '#999' },
  badge: { fontSize: 12, fontWeight: 'bold' },
  approveBtn: { backgroundColor: '#10B981', padding: 8, borderRadius: 6, justifyContent:'center' },
  approveText: { color: '#FFF', fontSize: 12, fontWeight:'bold' },
  editBtn: { padding: 10, backgroundColor: '#F3F4F6', borderRadius: 8, justifyContent:'center' },
  actionBtn: { backgroundColor: '#6C757D', paddingHorizontal: 12, paddingVertical:8, borderRadius: 6, justifyContent:'center' },
  actionText: { color: '#FFF', fontSize: 10, fontWeight:'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', textAlign: 'center', marginBottom: 15 },
  roleOption: { paddingVertical: 15, borderBottomWidth: 1, borderColor: '#EEE' },
  roleText: { fontSize: 16, color: '#333' }
});

export default GestionUsuarios;