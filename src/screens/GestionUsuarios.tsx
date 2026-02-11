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
  id: number;
  name: string;
  email: string;
  cuit: string; 
  role?: string;
  created_at?: string;
};

const ROLES = ['Cliente', 'Vendedor', 'Admin', 'Vendedor Black'];

const GestionUsuarios = () => {
  const navigation = useNavigation<any>();
  
  // SOLO DOS PESTAÑAS: usuarios | solicitudes
  const [activeTab, setActiveTab] = useState<'usuarios' | 'solicitudes'>('usuarios');
  const [dataList, setDataList] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal solo para usuarios existentes
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => { fetchData(); }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setDataList([]);
    try {
      let res;
      if (activeTab === 'usuarios') {
        // Usuarios ya activos
        res = await axios.get(`${API_URL}/admin/users/all`);
      } else {
        // Solicitudes pendientes
        res = await axios.get(`${API_URL}/admin/users/pending`);
      }
      if (res.data) setDataList(res.data);
    } catch (e) {
      // Ignorar errores silenciosos
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await axios.post(`${API_URL}/admin/users/approve`, { id, role: 'Cliente' });
      Alert.alert('Éxito', 'Aprobado');
      fetchData();
    } catch (e) { Alert.alert('Error', 'No se pudo aprobar'); }
  };

  const openRoleModal = (user: User) => {
    setSelectedUser(user);
    setModalVisible(true);
  };

  const handleChangeRole = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      await axios.post(`${API_URL}/admin/users/role`, { id: selectedUser.id, role: newRole });
      setModalVisible(false);
      Alert.alert('Éxito', 'Rol actualizado');
      fetchData();
    } catch (e) { Alert.alert('Error', 'No se pudo actualizar'); }
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
                <TouchableOpacity onPress={() => openRoleModal(item)} style={styles.editBtn}>
                    <Feather name="edit-2" size={18} color="#555" />
                </TouchableOpacity>
            </View>
        );
    }
    // Tab Solicitudes
    return (
        <View style={styles.card}>
            <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.cuit}>Pendiente</Text>
                <Text style={styles.date}>{item.email}</Text>
            </View>
            <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item.id)}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.approveText}>Aprobar</Text>
            </TouchableOpacity>
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><FlechaHeaderSvg width={24}/></TouchableOpacity>
        <Text style={styles.headerTitle}>Gestión Usuarios</Text>
        <View style={{width:24}}/>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab==='usuarios' && styles.activeTab]} onPress={()=>setActiveTab('usuarios')}>
            <Text style={[styles.tabText, activeTab==='usuarios' && styles.activeTabText]}>Usuarios</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab==='solicitudes' && styles.activeTab]} onPress={()=>setActiveTab('solicitudes')}>
            <Text style={[styles.tabText, activeTab==='solicitudes' && styles.activeTabText]}>Solicitudes</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color="#1C9BD8" style={{marginTop:20}}/> :
        <FlatList data={dataList} renderItem={renderItem} contentContainerStyle={{padding:15}}/>
      }

      <Modal visible={modalVisible} transparent onRequestClose={()=>setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={()=>setModalVisible(false)}>
            <Pressable style={styles.modalContent}>
                <Text style={styles.modalTitle}>Cambiar Rol</Text>
                {ROLES.map(r => (
                    <TouchableOpacity key={r} style={styles.roleOption} onPress={()=>handleChangeRole(r)}>
                        <Text style={styles.roleText}>{r}</Text>
                        {selectedUser?.role === r && <Ionicons name="checkmark" size={20} color="#1C9BD8"/>}
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
  approveBtn: { backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 6, justifyContent:'center' },
  approveText: { color: '#FFF', fontSize: 12, fontWeight:'bold', marginLeft: 4 },
  editBtn: { padding: 10, backgroundColor: '#F3F4F6', borderRadius: 8, justifyContent:'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', textAlign: 'center', marginBottom: 15 },
  roleOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#EEE' },
  roleText: { fontSize: 16, color: '#333' }
});

export default GestionUsuarios;