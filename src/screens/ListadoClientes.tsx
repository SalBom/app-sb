// src/screens/ListadoClientes.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

// LIBRERÍAS
import * as XLSX from 'xlsx';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import authStorage from '../utils/authStorage';

import { API_URL } from '../config';

// Alias para FileSystem
const FS = FileSystem as any;

// --- ICONOS ---
const IconExcel = () => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Path d="M14 2v6h6" />
    <Path d="M8 13l8 4" />
    <Path d="M16 13l-8 4" />
  </Svg>
);

const IconPdf = () => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Path d="M14 2v6h6" />
    <Path d="M10 13H8v5h2" />
    <Path d="M16 13h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2" />
    <Path d="M12 13v5" />
  </Svg>
);

const IconPhone = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C9BD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Svg>
);

const IconMail = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <Path d="M22 6l-10 7L2 6" />
  </Svg>
);

const IconWhatsApp = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </Svg>
);

const IconPin = () => (
  <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <Path d="M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
  </Svg>
);

type Cliente = {
  id: number;
  name: string;
  vat: string;
  street?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
};

const CONFIG_ESTADOS: Record<string, { title: string; color: string }> = {
  'perdidos':     { title: 'CLIENTES PERDIDOS', color: '#D32F2F' },
  'riesgo-alto':  { title: 'RIESGO ALTO',       color: '#f6f606ff' },
  'riesgo-medio': { title: 'RIESGO MEDIO',      color: '#F57C00' },
  'completo':     { title: 'CLIENTES ACTIVOS',  color: '#388E3C' },
  'atendidos':    { title: 'CLIENTES ATENDIDOS', color: '#1C9BD8' },
};

const ListadoClientes = () => {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  // CAMBIO: Recibimos cuitOverride
  const { 
    estadoId = 'perdidos', 
    month = new Date().getMonth() + 1, 
    year = new Date().getFullYear(),
    cuitOverride 
  } = route.params || {};

  const config = CONFIG_ESTADOS[estadoId] || { title: 'CLIENTES', color: '#333' };

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [modalType, setModalType] = useState<'city' | 'state' | null>(null);

  const fetchClientes = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      
      // CAMBIO: Usamos el override si existe, si no el del auth
      const cuit = cuitOverride || await authStorage.getCuitFromStorage();
      if (!cuit) throw new Error('No se encontró CUIT');

      const rawBaseUrl = API_URL;
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');

      const res = await fetch(`${baseUrl}/clientes-por-estado?cuit=${cuit}&estado=${estadoId}&month=${month}&year=${year}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Error al cargar clientes');
      setClientes(json.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [estadoId, month, year, cuitOverride]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const onRefresh = () => { setRefreshing(true); fetchClientes(true); };

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      const matchSearch = search ? (c.name.toLowerCase().includes(search.toLowerCase()) || c.vat.includes(search)) : true;
      const matchCity = selectedCity ? (c.city && c.city.toLowerCase() === selectedCity.toLowerCase()) : true;
      const matchState = selectedState ? (c.state && c.state.toLowerCase() === selectedState.toLowerCase()) : true;
      return matchSearch && matchCity && matchState;
    });
  }, [clientes, search, selectedCity, selectedState]);

  const uniqueCities = useMemo(() => [...new Set(clientes.map(c => c.city).filter(Boolean))].sort(), [clientes]);
  const uniqueStates = useMemo(() => [...new Set(clientes.map(c => c.state).filter(Boolean))].sort(), [clientes]);

  const handleCall = (phone: string) => Linking.openURL(`tel:${phone}`);
  const handleEmail = (email: string) => Linking.openURL(`mailto:${email}`);
  const handleWhatsApp = (phone: string) => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`);

  const handleDownloadPdf = async () => {
    try {
      if (filteredClientes.length === 0) return Alert.alert("Aviso", "No hay clientes para exportar.");
      const rows = filteredClientes.map(c => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.vat || ''}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.phone || ''}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.email || ''}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.city || ''}, ${c.state || ''}</td>
        </tr>
      `).join('');
      const html = `<html><head><style>body{font-family:'Helvetica';padding:20px}h1{color:${config.color};font-size:18px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;padding:8px;background-color:#f2f2f2;border-bottom:2px solid #ccc}</style></head><body><h1>Reporte - ${config.title} (${filteredClientes.length})</h1><table><thead><tr><th>Nombre</th><th>CUIT</th><th>Teléfono</th><th>Email</th><th>Ubicación</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) { Alert.alert("Error", "No se pudo generar el PDF."); }
  };

  const handleDownloadExcel = async () => {
    try {
      if (filteredClientes.length === 0) return Alert.alert("Aviso", "No hay clientes para exportar.");
      const data = filteredClientes.map(c => ({
        "Nombre": c.name,
        "CUIT": c.vat,
        "Teléfono": c.phone || "",
        "Email": c.email || "",
        "Dirección": c.street || "",
        "Ciudad": c.city || "",
        "Provincia": c.state || "",
        "Estado (Reporte)": config.title
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `Reporte_${estadoId}_${Date.now()}.xlsx`;
      const dir = FS.documentDirectory || FS.cacheDirectory;
      const uri = dir + fileName;
      await FS.writeAsStringAsync(uri, wbout, { encoding: 'base64' });
      await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Descargar Reporte Excel', UTI: 'com.microsoft.excel.xlsx' });
    } catch (error) { Alert.alert("Error", "No se pudo generar el Excel."); }
  };

  const renderItem = ({ item }: { item: Cliente }) => (
    <View style={s.rowContainer}>
      <View style={s.dataCol}>
        <Text style={s.clientName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.clientMeta}>CUIT: {item.vat || '—'}</Text>
        <View style={s.locationRow}>
            <IconPin />
            <Text style={s.clientAddress} numberOfLines={1}>
                {[item.city, item.state].filter(Boolean).join(', ') || 'Sin ubicación'}
            </Text>
        </View>
      </View>
      <View style={s.actionsCol}>
        {item.phone && (
            <>
              <TouchableOpacity style={s.iconBtn} onPress={() => handleCall(item.phone!)}><IconPhone /></TouchableOpacity>
              <TouchableOpacity style={[s.iconBtn, s.iconBtnWa]} onPress={() => handleWhatsApp(item.phone!)}><IconWhatsApp /></TouchableOpacity>
            </>
        )}
        {item.email && (
            <TouchableOpacity style={[s.iconBtn, { marginLeft: 10 }]} onPress={() => handleEmail(item.email!)}><IconMail /></TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.headerRow}>
        <View style={s.titleContainer}>
            <Text style={[s.title, { color: config.color }]} numberOfLines={1}>
            {config.title}
            </Text>
            <Text style={s.countText}>({filteredClientes.length})</Text>
        </View>
        <View style={s.exportButtonsRow}>
            <TouchableOpacity style={[s.exportBtn, { borderColor: '#2E7D32', backgroundColor: '#E8F5E9' }]} onPress={handleDownloadExcel}>
                <IconExcel />
                <Text style={[s.exportText, { color: '#2E7D32' }]}>XLS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.exportBtn, { borderColor: '#C62828', backgroundColor: '#FFEBEE', marginLeft: 8 }]} onPress={handleDownloadPdf}>
                <IconPdf />
                <Text style={[s.exportText, { color: '#C62828' }]}>PDF</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={s.filtersContainer}>
        <View style={s.searchRow}>
           <View style={s.searchInputWrap}>
              <TextInput style={s.searchInput} placeholder="BUSCAR CLIENTE O CUIT" placeholderTextColor="#999" value={search} onChangeText={setSearch}/>
              <Ionicons name="search" size={20} color="#999" style={s.searchIcon} />
           </View>
        </View>
        
        <View style={s.filtersRow}>
            <TouchableOpacity style={[s.filterInputWrap, { marginRight: 10 }]} onPress={() => setModalType('state')}>
                <Text style={[s.filterText, !selectedState && { color: '#999' }]} numberOfLines={1}>{selectedState || "PROVINCIA"}</Text>
                <Ionicons name="chevron-down" size={16} color="#999" />
            </TouchableOpacity>
            <TouchableOpacity style={s.filterInputWrap} onPress={() => setModalType('city')}>
                <Text style={[s.filterText, !selectedCity && { color: '#999' }]} numberOfLines={1}>{selectedCity || "CIUDAD"}</Text>
                <Ionicons name="chevron-down" size={16} color="#999" />
            </TouchableOpacity>
        </View>
        
        {(selectedCity || selectedState) && (
            <View style={s.chipsRow}>
                {selectedState && <TouchableOpacity onPress={() => setSelectedState(null)} style={s.chip}><Text style={s.chipText}>{selectedState} ✕</Text></TouchableOpacity>}
                {selectedCity && <TouchableOpacity onPress={() => setSelectedCity(null)} style={s.chip}><Text style={s.chipText}>{selectedCity} ✕</Text></TouchableOpacity>}
            </View>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={s.center}><ActivityIndicator size="large" color={config.color} /><Text style={s.loadingText}>Cargando listado...</Text></View>
      ) : error ? (
        <View style={s.center}><Text style={s.errorText}>{error}</Text><TouchableOpacity onPress={() => fetchClientes()} style={[s.retryBtn, { backgroundColor: config.color }]}><Text style={s.retryText}>Reintentar</Text></TouchableOpacity></View>
      ) : (
        <FlatList
          data={filteredClientes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[config.color]} tintColor={config.color} />}
          ListEmptyComponent={<View style={s.emptyContainer}><Text style={s.emptyText}>No se encontraron clientes.</Text></View>}
        />
      )}

      <Modal visible={!!modalType} transparent animationType="fade" onRequestClose={() => setModalType(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalType(null)}>
            <View style={s.modalContent}>
                <Text style={s.modalTitle}>Seleccionar {modalType === 'state' ? 'Provincia' : 'Ciudad'}</Text>
                <ScrollView style={{ maxHeight: 300 }}>
                    {(modalType === 'state' ? uniqueStates : uniqueCities).map((item, idx) => (
                        <TouchableOpacity key={idx} style={s.modalItem} onPress={() => { if (modalType === 'state') setSelectedState(item as string); else setSelectedCity(item as string); setModalType(null); }}>
                            <Text style={s.modalItemText}>{item || 'Desconocido'}</Text>
                        </TouchableOpacity>
                    ))}
                    {(modalType === 'state' ? uniqueStates : uniqueCities).length === 0 && <Text style={s.emptyText}>No hay opciones disponibles.</Text>}
                </ScrollView>
                <TouchableOpacity style={s.modalCloseBtn} onPress={() => setModalType(null)}><Text style={s.modalCloseText}>Cerrar</Text></TouchableOpacity>
            </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 0, 
    marginTop: -10, 
    paddingBottom: 4,
    backgroundColor: '#fff',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 22,
    fontFamily: 'BarlowCondensed-Bold',
    letterSpacing: 0.5,
  },
  countText: {
    color: '#999',
    fontSize: 18,
    marginLeft: 6,
    fontFamily: 'BarlowCondensed-Regular'
  },
  exportButtonsRow: {
    flexDirection: 'row',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  exportText: {
    marginLeft: 3,
    fontSize: 10,
    fontFamily: 'BarlowCondensed-Bold',
    fontWeight: '700',
  },
  filtersContainer: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingTop: 8 },
  searchRow: { marginBottom: 10 },
  searchInputWrap: { backgroundColor: '#F5F5F5', borderRadius: 20, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B' },
  searchIcon: { marginLeft: 8 },
  filtersRow: { flexDirection: 'row' },
  filterInputWrap: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  filterText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B', flex: 1 },
  chipsRow: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: '#E3F2FD', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4 },
  chipText: { fontSize: 12, color: '#1565C0', fontFamily: 'BarlowCondensed-Bold' },
  listContent: { paddingHorizontal: 0 },
  rowContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#fff' },
  dataCol: { flex: 1, justifyContent: 'center' },
  clientName: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginBottom: 2 },
  clientMeta: { fontSize: 13, color: '#666', fontFamily: 'BarlowCondensed-Regular' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  clientAddress: { fontSize: 12, color: '#999', marginLeft: 4 },
  actionsCol: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center' },
  iconBtnWa: { marginLeft: 10, backgroundColor: '#F0FFF4' },
  separator: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 16 },
  loadingText: { marginTop: 10, color: '#666' },
  errorText: { color: '#D32F2F', textAlign: 'center', marginBottom: 10 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: 'bold' },
  emptyContainer: { marginTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999', fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', marginBottom: 15, textAlign: 'center' },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalItemText: { fontSize: 16, color: '#333' },
  modalCloseBtn: { marginTop: 15, alignSelf: 'center', padding: 10 },
  modalCloseText: { color: '#D32F2F', fontWeight: 'bold' },
});

export default ListadoClientes;