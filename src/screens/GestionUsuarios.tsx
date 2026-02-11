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
  
  // SOLO DOS PESTAÑAS
  const [activeTab, setActiveTab] = useState<'usuarios' | 'solicitudes'>('usuarios');
  const [dataList, setDataList] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal para cambiar rol
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setDataList([]);
    try {
      let res;
      if (activeTab === 'usuarios') {
        // Trae usuarios ya registrados (endpoint SQL rápido)
        res = await axios.get(`${API_URL}/admin/users/all`);
      } else {
        // Trae solicitudes pendientes
        res = await axios.get(`${API_URL}/admin/users/pending`);
      }
      
      if (res.data) setDataList(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await axios.post(`${API_URL}/admin/users/approve`, { id, role: 'Cliente' });
      Alert.alert('Éxito', 'Usuario aprobado correctamente');
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'No se pudo aprobar');
    }
  };

  const openRoleModal = (user: User) => {
    setSelectedUser(user);
    setModalVisible(true);
  };

  const handleChangeRole = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      await axios.post(`${API_URL}/admin/users/role`, {
        id: selectedUser.id,
        role: newRole
      });
      setModalVisible(false);
      Alert.alert('Éxito', 'Rol actualizado');
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar el rol');
    }
  };

  const renderItem = ({ item }: { item: User }) => {
    if (activeTab === 'usuarios') {
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.cuit}>{item.cuit || '---'}</Text>
                    <Text style={styles.role}>Rol: <Text style={{fontWeight:'bold'}}>{item.role || 'Cliente'}</Text></Text>
                    {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => openRoleModal(item)} style={styles.editBtn}>
                    <Feather name="edit-2" size={18} color="#555" />
                </TouchableOpacity>
            </View>
        );
    }
    // Vista Solicitudes
    return (
        <View style={styles.card}>
            <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.cuit}>{item.cuit}</Text>
                <Text style={styles.email}>{item.email}</Text>
                <Text style={styles.date}>Solicitado: {item.created_at ? String(item.created_at).substring(0,10) : '--'}</Text>
            </View>
            <View style={styles.actions}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item.id)}>
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={styles.approveText}>Aprobar</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <FlechaHeaderSvg width={24} height={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestión de Usuarios</Text>
        <View style={{width: 24}} />
      </View>

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
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1C9BD8" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={dataList}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No hay registros.</Text>}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalContent}>
                <Text style={styles.modalTitle}>Cambiar Rol</Text>
                <Text style={{textAlign:'center', marginBottom:15, color:'#666'}}>
                    Usuario: {selectedUser?.name}
                </Text>
                {ROLES.map(r => (
                    <TouchableOpacity 
                        key={r} 
                        style={[styles.roleOption, selectedUser?.role === r && styles.roleOptionSelected]}
                        onPress={() => handleChangeRole(r)}
                    >
                        <Text style={[styles.roleText, selectedUser?.role === r && styles.roleTextSelected]}>{r}</Text>
                        {selectedUser?.role === r && <Ionicons name="checkmark" size={20} color="#1C9BD8" />}
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