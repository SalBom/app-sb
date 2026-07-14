import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Pressable, ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

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
  const isDesktopWeb = useIsDesktopWeb();

  // TRES PESTAÑAS: 
  // 1. usuarios (Muestra los ya asignados/registrados)
  // 2. solicitudes (Nuevos registros esperando aprobación)
  // 3. odoo (Lista cruda de Odoo para pre-asignar)
  const [activeTab, setActiveTab] = useState<'usuarios' | 'solicitudes' | 'odoo'>('usuarios');
  
  const [dataList, setDataList] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal de Asignación/Cambio de Rol
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setDataList([]);
    try {
      let res;
      if (activeTab === 'usuarios') {
        // Trae la lista unificada (Registrados + Pre-asignados)
        res = await axios.get(`${API_URL}/users`);
      } else if (activeTab === 'solicitudes') {
        // Trae usuarios que se registraron pero no tienen rol
        res = await axios.get(`${API_URL}/admin/users/pending`);
      } else {
        // Trae usuarios directos de Odoo (Optimizado)
        res = await axios.get(`${API_URL}/odoo-users`);
      }
      
      if (res.data) {
        if (activeTab === 'usuarios') {
          // Filtrar duplicados priorizando a los usuarios ya registrados (IDs positivos)
          const registrados = res.data.filter((u: User) => (u.id || 0) > 0);
          const cuitsRegistrados = new Set(registrados.map((u: User) => u.cuit));
          
          const preAsignadosValidos = res.data.filter((u: User) => 
            (u.id || 0) < 0 && !cuitsRegistrados.has(u.cuit)
          );
          
          setDataList([...registrados, ...preAsignadosValidos]);
        } else {
          setDataList(res.data);
        }
      }
    } catch (e) {
      console.error(e);
      if (activeTab !== 'usuarios') Alert.alert('Aviso', 'No se pudieron cargar los datos de esta sección.');
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

  const openRoleModal = (user: User, importing = false) => {
    setSelectedUser(user);
    setIsImporting(importing); // true si viene de la pestaña Odoo
    setModalVisible(true);
  };

  const handleChangeRole = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      if (isImporting) {
        // CASO 1: Pre-asignar desde Odoo
        await axios.post(`${API_URL}/admin/preasignar`, {
          email: selectedUser.email,
          cuit: selectedUser.cuit,
          name: selectedUser.name,
          role: newRole 
        });
        Alert.alert('Listo', `Rol asignado a ${selectedUser.name}. Ya aparecerá en el Dashboard.`);
      } else {
        // CASO 2: Cambiar rol a usuario ya existente en la App
        if (!selectedUser.id) return;
        await axios.post(`${API_URL}/admin/users/role`, {
          id: selectedUser.id,
          role: newRole
        });
        Alert.alert('Éxito', 'Rol actualizado');
      }
      setModalVisible(false);
      fetchData(); // Recargar lista
    } catch (e: any) {
      const msg = e.response?.data?.error || 'No se pudo realizar la operación';
      Alert.alert('Error', msg);
    }
  };

  const renderItem = ({ item }: { item: User }) => {
    
    // TAB 1: USUARIOS (Registrados + Pre-asignados)
    if (activeTab === 'usuarios') {
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.cuit}>{item.cuit || '---'}</Text>
                    <Text style={styles.role}>Rol: <Text style={{fontWeight:'bold'}}>{item.role || 'Cliente'}</Text></Text>
                    {/* Los preasignados tienen IDs generados negativos (-1, -2, etc) */}
                    {(item.id || 0) < 0 && (
                        <Text style={{fontSize:10, color:'#E67E22', marginTop:2}}>* Pre-asignado (No registrado)</Text>
                    )}
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
                    <Text style={styles.cuit}>Pendiente</Text>
                    <Text style={styles.date}>{item.email}</Text>
                </View>
                <TouchableOpacity style={styles.approveBtn} onPress={() => item.id && handleApprove(item.id)}>
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={styles.approveText}>Aprobar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // TAB 3: USUARIOS ODOO (Para importar)
    if (activeTab === 'odoo') {
        const isInternal = item.tipo_odoo === 'Interno';
        return (
            <View style={styles.card}>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <View style={{flexDirection:'row', gap:8, alignItems:'center', marginTop:4}}>
                        <View style={[styles.badge, { backgroundColor: isInternal ? '#FFF3E0' : '#E3F2FD' }]}>
                            <Text style={{fontSize:10, fontWeight:'bold', color: isInternal ? '#E67E22' : '#1C9BD8'}}>
                                {item.tipo_odoo?.toUpperCase()}
                            </Text>
                        </View>
                        <Text style={styles.cuit}>{item.cuit || 'Sin CUIT'}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => openRoleModal(item, true)} style={[styles.approveBtn, { backgroundColor: '#6C757D' }]}>
                    <Text style={styles.approveText}>ASIGNAR ROL</Text>
                </TouchableOpacity>
            </View>
        );
    }
    return null;
  };

  // ===========================================================================
  // VERSIÓN DESKTOP WEB
  // ===========================================================================
  if (isDesktopWeb) {
    const renderRowD = (item: User) => {
      if (activeTab === 'usuarios') {
        return (
          <View key={String(item.id || item.odoo_id)} style={ds.row}>
            <View style={{ flex: 2.2 }}>
              <Text style={ds.rowName}>{item.name}</Text>
              {(item.id || 0) < 0 && <Text style={ds.rowHint}>Pre-asignado (no registrado)</Text>}
            </View>
            <Text style={[ds.rowCell, { flex: 1.4 }]}>{item.cuit || '---'}</Text>
            <Text style={[ds.rowCell, { flex: 1, color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold' }]}>{item.role || 'Cliente'}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity onPress={() => openRoleModal(item, false)} style={ds.editBtn}>
                <Feather name="edit-2" size={16} color="#555" />
              </TouchableOpacity>
            </View>
          </View>
        );
      }
      if (activeTab === 'solicitudes') {
        return (
          <View key={String(item.id || item.odoo_id)} style={ds.row}>
            <Text style={[ds.rowName, { flex: 2.2 }]}>{item.name}</Text>
            <Text style={[ds.rowCell, { flex: 2.4 }]}>{item.email}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity style={ds.approveBtn} onPress={() => item.id && handleApprove(item.id)}>
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={ds.approveText}>Aprobar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }
      const isInternal = item.tipo_odoo === 'Interno';
      return (
        <View key={String(item.id || item.odoo_id)} style={ds.row}>
          <Text style={[ds.rowName, { flex: 2.2 }]}>{item.name}</Text>
          <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[ds.badge, { backgroundColor: isInternal ? '#FFF3E0' : '#E3F2FD' }]}>
              <Text style={{ fontSize: 10, fontFamily: 'BarlowCondensed-Bold', color: isInternal ? '#E67E22' : '#1C9BD8' }}>{item.tipo_odoo?.toUpperCase()}</Text>
            </View>
            <Text style={ds.rowCell}>{item.cuit || 'Sin CUIT'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => openRoleModal(item, true)} style={[ds.approveBtn, { backgroundColor: '#6C757D' }]}>
              <Text style={ds.approveText}>ASIGNAR ROL</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    };

    return (
      <View style={ds.screen}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <View style={ds.page}>
            <Text style={ds.pageTitle}>GESTIÓN DE USUARIOS</Text>

            <View style={ds.tabsRow}>
              {(['usuarios', 'solicitudes', 'odoo'] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setActiveTab(t)}>
                  <Text style={[ds.tabText, activeTab === t && ds.tabTextActive]}>
                    {t === 'usuarios' ? 'Usuarios' : t === 'solicitudes' ? 'Solicitudes' : 'Usuarios Odoo'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={ds.tabDivider} />

            {loading ? (
              <ActivityIndicator size="large" color="#1C9BD8" style={{ marginTop: 40 }} />
            ) : dataList.length === 0 ? (
              <Text style={ds.emptyText}>No hay registros.</Text>
            ) : (
              <View style={ds.table}>
                <View style={ds.tableHeadRow}>
                  <Text style={[ds.th, { flex: 2.2 }]}>NOMBRE</Text>
                  <Text style={[ds.th, { flex: activeTab === 'solicitudes' ? 2.4 : 1.4 }]}>{activeTab === 'solicitudes' ? 'EMAIL' : activeTab === 'odoo' ? 'ORIGEN' : 'CUIT'}</Text>
                  {activeTab === 'usuarios' && <Text style={[ds.th, { flex: 1 }]}>ROL</Text>}
                  {activeTab === 'odoo' && <View style={{ flex: 1 }} />}
                  <Text style={[ds.th, { flex: 1, textAlign: 'right' }]}>ACCIÓN</Text>
                </View>
                {dataList.map(renderRowD)}
              </View>
            )}
          </View>
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <Pressable style={ds.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={ds.modalCard} onPress={(e: any) => e.stopPropagation?.()}>
              <Text style={styles.modalTitle}>{isImporting ? 'Asignar Rol (Pre-alta)' : 'Cambiar Rol'}</Text>
              <Text style={{ textAlign: 'center', marginBottom: 15, color: '#666' }}>Usuario: {selectedUser?.name}</Text>
              {ROLES.map((r) => (
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
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestión de Usuarios</Text>
        <View style={{width: 24}} />
      </View>

      {/* Selector de Pestañas */}
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
          <Text style={[styles.tabText, activeTab === 'odoo' && styles.activeTabText]}>Usuarios Odoo</Text>
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

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                    {isImporting ? 'Asignar Rol (Pre-alta)' : 'Cambiar Rol'}
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
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  approveBtn: { 
    backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', 
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'center'
  },
  approveText: { color: '#FFF', fontSize: 10, fontFamily: 'BarlowCondensed-Bold', marginLeft: 4 },
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

// --- Estilos exclusivos de desktop ---
const ds = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  page: { width: '100%', paddingHorizontal: 40, paddingTop: 30 },
  pageTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 44, color: '#2B2B2B', marginBottom: 26, textTransform: 'uppercase' },

  tabsRow: { flexDirection: 'row', gap: 32 },
  tabText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#9CA3AF', paddingBottom: 12 },
  tabTextActive: { color: '#1C9BD8', borderBottomWidth: 2, borderBottomColor: '#1C9BD8' },
  tabDivider: { height: 1, backgroundColor: '#EFEFEF', marginTop: -1, marginBottom: 24 },

  table: { borderWidth: 1, borderColor: '#ECECEC', borderRadius: 12, overflow: 'hidden' },
  tableHeadRow: { flexDirection: 'row', backgroundColor: '#FAFAFA', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  th: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: '#8A8A8A', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowName: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  rowHint: { fontFamily: 'Rubik', fontSize: 11, color: '#E67E22', marginTop: 2 },
  rowCell: { fontFamily: 'Rubik', fontSize: 13, color: '#555' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  editBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  approveText: { color: '#FFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold' },
  emptyText: { textAlign: 'center', marginTop: 60, color: '#999', fontSize: 16, fontFamily: 'BarlowCondensed-Regular' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: 420, maxWidth: '90%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 8 },
});

export default GestionUsuarios;