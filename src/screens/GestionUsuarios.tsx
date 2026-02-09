import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, Modal, Pressable 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { Feather } from '@expo/vector-icons';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';

import { API_URL } from '../config';

type User = {
  id: number;
  name: string;
  cuit: string; 
  role?: string;
  created_at?: string;
};

const ROLES = ['Cliente', 'Vendedor', 'Admin', 'Vendedor Black'];

const GestionUsuarios = () => {
  const navigation = useNavigation<any>();
  
  const [activeTab, setActiveTab] = useState<'usuarios' | 'solicitudes'>('usuarios');
  const [dataList, setDataList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados para Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setDataList([]);
    try {
      if (activeTab === 'usuarios') {
        // CORRECCIÓN: Usamos el endpoint de la APP (/admin/users/all) en lugar de Odoo (/users)
        // para ver los usuarios registrados con el nuevo sistema.
        const res = await axios.get(`${API_URL}/admin/users/all`);
        setDataList(res.data);
      } else {
        // Solicitudes pendientes
        const res = await axios.get(`${API_URL}/admin/users/pending`);
        setDataList(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Aprobar solicitud (Pasa a Cliente)
  const handleApprove = (user: User) => {
    Alert.alert(
      "Aprobar Solicitud",
      `¿Dar acceso a ${user.name || user.cuit}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Aprobar", 
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/admin/users/approve`, { 
                id: user.id, 
                role: 'Cliente' 
              });
              Alert.alert("Éxito", "Usuario aprobado.");
              fetchData(); 
            } catch (e) {
              Alert.alert("Error", "No se pudo aprobar.");
            }
          } 
        }
      ]
    );
  };

  // Editar Rol
  const handleEditRole = (user: User) => {
    setSelectedUser(user);
    setModalVisible(true);
  };

  const confirmRoleChange = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      // Usamos el endpoint genérico de cambio de rol
      await axios.post(`${API_URL}/admin/users/role`, { 
        id: selectedUser.id, 
        role: newRole 
      });
      setModalVisible(false);
      fetchData();
      Alert.alert("Éxito", "Rol actualizado.");
    } catch (e) {
      Alert.alert("Error", "Fallo al actualizar rol.");
    }
  };

  const renderItem = ({ item }: { item: User }) => {
    const isPendingTab = activeTab === 'solicitudes';

    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.userName}>{item.name || 'Sin Nombre'}</Text>
          <Text style={styles.userCuit}>{item.cuit || 'Sin CUIT'}</Text>
          
          {!isPendingTab && (
            <View style={styles.roleBadge}>
               <Text style={styles.roleText}>{item.role || 'Sin Rol'}</Text>
            </View>
          )}
          
          {isPendingTab && item.created_at && (
             <Text style={styles.date}>Solicitado: {new Date(item.created_at).toLocaleDateString()}</Text>
          )}
        </View>

        <View style={styles.actions}>
          {isPendingTab ? (
            <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item)}>
              <Feather name="check" size={18} color="#FFF" />
              <Text style={styles.approveText}>ALTA</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.editBtn} onPress={() => handleEditRole(item)}>
              <Feather name="edit-2" size={20} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
            <FlechaHeaderSvg width={50} height={36} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GESTIÓN DE USUARIOS</Text>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'usuarios' && styles.activeTab]} 
          onPress={() => setActiveTab('usuarios')}
        >
          <Text style={[styles.tabText, activeTab === 'usuarios' && styles.activeTabText]}>USUARIOS</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'solicitudes' && styles.activeTab]} 
          onPress={() => setActiveTab('solicitudes')}
        >
          <Text style={[styles.tabText, activeTab === 'solicitudes' && styles.activeTabText]}>SOLICITUDES</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1C9BD8" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={dataList}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {activeTab === 'usuarios' ? "No se encontraron usuarios." : "No hay solicitudes pendientes."}
            </Text>
          }
        />
      )}

      {/* Modal Roles */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Asignar Rol a {selectedUser?.name}</Text>
            {ROLES.map(role => (
              <TouchableOpacity 
                key={role} 
                style={[styles.roleOption, selectedUser?.role === role && styles.roleOptionSelected]}
                onPress={() => confirmRoleChange(role)}
              >
                <Text style={[styles.roleOptionText, selectedUser?.role === role && styles.roleOptionTextSelected]}>
                  {role}
                </Text>
                {selectedUser?.role === role && <Feather name="check" size={18} color="#1C9BD8" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeModalText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', paddingTop: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 0, marginBottom: 15 },
  headerTitle: { marginLeft: 8, fontSize: 22, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },
  
  tabsContainer: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 15, backgroundColor: '#F3F4F6', borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { fontFamily: 'BarlowCondensed-Medium', color: '#9CA3AF', fontSize: 14 },
  activeTabText: { color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold' },

  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1
  },
  info: { flex: 1 },
  userName: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#374151' },
  userCuit: { fontSize: 14, color: '#6B7280', fontFamily: 'BarlowCondensed-Regular' },
  roleBadge: { backgroundColor: '#EFF6FF', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  roleText: { color: '#1D4ED8', fontSize: 10, fontFamily: 'BarlowCondensed-Bold', textTransform: 'uppercase' },
  date: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },

  actions: { marginLeft: 10 },
  approveBtn: {
    backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6
  },
  approveText: { color: '#FFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold', marginLeft: 4 },
  editBtn: { padding: 10, backgroundColor: '#F3F4F6', borderRadius: 8 },

  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16, fontFamily: 'BarlowCondensed-Regular' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, marginBottom: 15, color: '#333', textAlign: 'center' },
  roleOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  roleOptionSelected: { backgroundColor: '#F0F9FF', marginHorizontal: -20, paddingHorizontal: 20 },
  roleOptionText: { fontSize: 16, fontFamily: 'BarlowCondensed-Medium', color: '#555' },
  roleOptionTextSelected: { color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold' },
  closeModalBtn: { marginTop: 15, paddingVertical: 10, alignItems: 'center' },
  closeModalText: { color: '#EF4444', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 }
});

export default GestionUsuarios;