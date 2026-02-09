// src/screens/pedidos.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; 

import authStorage from '../utils/authStorage';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';
import ContenedorFacturaSvg from '../../assets/contenedorFactura.svg'; 
import FlechaPedidoSvg from '../../assets/flechaPedido.svg';

import { API_URL } from '../config';

type PedidoItem = {
  numero_pedido: string;
  cliente: string;
  fecha: string;
  total: number;
  estado: string; 
};

const PAGE_SIZE = 20;

const Pedidos: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>(); // Hook para recibir parámetros
  const { cuitOverride } = route.params || {}; // CUIT opcional desde Admin

  const [pedidos, setPedidos] = useState<PedidoItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); 
    if (event.type === 'set' && selectedDate) {
      setDateFilter(selectedDate);
      setShowDatePicker(false); 
    } else {
        setShowDatePicker(false);
    }
  };

  const clearDateFilter = () => setDateFilter(null);
  const displayDate = dateFilter ? dateFilter.toLocaleDateString('es-AR') : '';

  const getBaseUrl = () => {
    const rawBaseUrl = API_URL;
    return rawBaseUrl.replace(/\/+$/, '');
  };

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchPedidos = async (currentOffset: number, isRefresh = false) => {
    try {
      // CAMBIO: Priorizar override
      const cuit = cuitOverride || await authStorage.getCuitFromStorage();
      if (!cuit) {
        setError('No se encontró CUIT.');
        setLoadingInitial(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      const baseUrl = getBaseUrl();
      let url = `${baseUrl}/mis_pedidos?cuit=${encodeURIComponent(cuit)}&limit=${PAGE_SIZE}&offset=${currentOffset}`;
      
      if (search.trim()) url += `&q=${encodeURIComponent(search.trim())}`;
      if (dateFilter) url += `&date=${formatDateForBackend(dateFilter)}`;
      if (statusFilter.trim()) url += `&state=${encodeURIComponent(statusFilter.trim())}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || 'Error al cargar pedidos');

      const newItems = (json?.items || []) as PedidoItem[];

      if (isRefresh) {
        setPedidos(newItems);
      } else {
        setPedidos(prev => [...prev, ...newItems]);
      }

      setHasMore(newItems.length >= PAGE_SIZE);

    } catch (e: any) {
      console.log('Error fetching pedidos:', e);
      setError('Error de conexión.');
    } finally {
      setLoadingInitial(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchPedidos(0, true); }, []);

  useEffect(() => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
          setLoadingInitial(true); 
          setOffset(0); 
          setHasMore(true);
          fetchPedidos(0, true); 
      }, 500);
      return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [search, dateFilter, statusFilter]); 

  const onRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    setOffset(0);
    fetchPedidos(0, true);
  };

  const loadMore = () => {
    const isFiltering = (search.trim() !== '') || (dateFilter !== null) || (statusFilter.trim() !== '');
    if (isFiltering) return; 
    if (!hasMore || loadingMore || loadingInitial || refreshing) return;
    setLoadingMore(true);
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchPedidos(newOffset, false);
  };

  const handleDownloadPdf = async (pedidoNombre: string) => {
    try {
        const baseUrl = getBaseUrl();
        const url = `${baseUrl}/pedido_pdf?pedidoId=${encodeURIComponent(pedidoNombre)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) { Alert.alert('Aviso', json?.error || 'No se encontró el PDF.'); return; }
        if (json.pdf_url) await Linking.openURL(json.pdf_url);
        else Alert.alert('Error', 'URL de PDF inválida.');
    } catch (e) { Alert.alert('Error', 'No se pudo descargar el PDF.'); }
  };

  const formatCurrency = (value: number) => value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const getEstadoInfo = (estado: string) => {
    switch (estado) {
        case 'sale': case 'done': return { label: 'CONFIRMADO', color: '#4CAF50' };
        case 'draft': case 'sent': return { label: 'PRESUPUESTO', color: '#9E9E9E' };
        case 'cancel': return { label: 'CANCELADO', color: '#CC0000' };
        default: return { label: estado.toUpperCase(), color: '#9E9E9E' };
    }
  };

  const formatFecha = (f: string) => (!f || f === 'Sin fecha' ? '---' : f.split(' ')[0]);

  const renderItem = ({ item }: { item: PedidoItem }) => {
    const estadoInfo = getEstadoInfo(item.estado);
    return (
      <View style={s.cardContainer}>
          <ContenedorFacturaSvg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none"/>
          <View style={s.cardContent}>
              <View style={s.cardHeaderRow}>
                  <View style={s.flechaTagContainer}>
                      <FlechaPedidoSvg width={200} height={40} style={StyleSheet.absoluteFill} preserveAspectRatio="none"/>
                      <Text style={s.tagText} numberOfLines={1}>{item.numero_pedido.replace('S', 'PEDIDO #')}</Text>
                  </View>
              </View>
              <View style={s.cardBody}>
                  <View style={s.infoColumn}>
                      <Text style={s.infoRow}><Text style={s.label}>CLIENTE: </Text><Text style={s.value} numberOfLines={1}>{item.cliente}</Text></Text>
                      <Text style={s.infoRow}><Text style={s.label}>FECHA: </Text><Text style={s.value}>{formatFecha(item.fecha)}</Text></Text>
                      <Text style={s.infoRow}><Text style={s.label}>TOTAL: </Text><Text style={s.value}>$ {formatCurrency(item.total)}</Text></Text>
                  </View>
                  <View style={s.statusColumn}>
                      <View style={[s.badge, { backgroundColor: estadoInfo.color }]}><Text style={s.badgeText}>{estadoInfo.label}</Text></View>
                      <View style={s.actionsRow}>
                          <TouchableOpacity style={s.iconButton} onPress={() => handleDownloadPdf(item.numero_pedido)}><Feather name="download" size={20} color="#2B2B2B" /></TouchableOpacity>
                          <TouchableOpacity style={s.iconButton}><Feather name="info" size={20} color="#2B2B2B" /></TouchableOpacity>
                      </View>
                  </View>
              </View>
          </View>
      </View>
    );
  };

  const renderFooter = () => {
    const isFiltering = (search.trim() !== '') || (dateFilter !== null) || (statusFilter.trim() !== '');
    if (isFiltering || !loadingMore) return <View style={{ height: 20 }} />;
    return <View style={{ paddingVertical: 20 }}><ActivityIndicator size="small" color="#0088CC" /></View>;
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginRight: 8}}>
            <FlechaHeaderSvg width={50} height={36} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>PEDIDOS</Text>
      </View>

      <View style={s.filtersContainer}>
        <View style={s.searchRow}>
           <View style={s.searchInputWrap}>
              <TextInput style={s.searchInput} placeholder="BUSCAR" placeholderTextColor="#999" value={search} onChangeText={setSearch}/>
              <Ionicons name="search" size={20} color="#999" style={s.searchIcon} />
           </View>
        </View>
        <View style={s.filtersRow}>
            <TouchableOpacity style={[s.filterInputWrap, { marginRight: 10, flexDirection: 'row', alignItems: 'center' }]} onPress={() => setShowDatePicker(true)}>
                <Text style={[s.filterInput, !dateFilter && { color: '#999' }]}>{dateFilter ? displayDate : "FECHA"}</Text>
                {dateFilter && <TouchableOpacity onPress={clearDateFilter} style={{ padding: 4 }}><Ionicons name="close-circle" size={16} color="#999" /></TouchableOpacity>}
            </TouchableOpacity>
            <View style={s.filterInputWrap}>
                <TextInput style={s.filterInput} placeholder="ESTADO" placeholderTextColor="#999" value={statusFilter} onChangeText={setStatusFilter}/>
            </View>
        </View>
      </View>

      {showDatePicker && <DateTimePicker value={dateFilter || new Date()} mode="date" display="default" onChange={onChangeDate} maximumDate={new Date()} />}

      {loadingInitial ? (
          <ActivityIndicator size="large" color="#0088CC" style={{ marginTop: 40 }} />
      ) : (
          <FlatList
            data={pedidos}
            keyExtractor={(item, index) => item.numero_pedido + index}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            onRefresh={onRefresh}
            refreshing={refreshing}
            ListEmptyComponent={!loadingInitial && !error ? <Text style={s.emptyText}>No se encontraron pedidos.</Text> : null}
          />
      )}
      {error && <Text style={s.errorText}>{error}</Text>}
    </View>
  );
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 10, backgroundColor: '#FAFAFA', zIndex: 10 },
  headerTitle: { fontSize: 28, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', textTransform: 'uppercase' },
  filtersContainer: { paddingHorizontal: 16, marginBottom: 10, backgroundColor: '#FAFAFA', paddingBottom: 5 },
  searchRow: { marginBottom: 8 },
  searchInputWrap: { backgroundColor: '#FAFAFA', borderRadius: 20, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },
  searchIcon: { marginLeft: 8 },
  filtersRow: { flexDirection: 'row' },
  filterInputWrap: { flex: 1, backgroundColor: '#FAFAFA', borderRadius: 20, height: 40, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  filterInput: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B', flex: 1, textAlignVertical: 'center' },
  listContent: { paddingRight: 16, paddingBottom: 20 },
  errorText: { color: 'red', textAlign: 'center', marginTop: 20, fontFamily: 'BarlowCondensed-Bold', position: 'absolute', bottom: 20, alignSelf: 'center' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  cardContainer: { height: 140, borderRadius: 12, marginLeft: -7, overflow: 'hidden', position: 'relative', backgroundColor: 'transparent', marginBottom: 8 },
  cardContent: { flex: 1 },
  cardHeaderRow: { alignItems: 'flex-start' },
  flechaTagContainer: { height: 40, width: 220, justifyContent: 'center', paddingLeft: 20, position: 'relative' },
  tagText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 20, zIndex: 1, textTransform: 'uppercase' },
  cardBody: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 0, justifyContent: 'space-between' },
  infoColumn: { flex: 1, marginRight: 10 },
  infoRow: { marginBottom: 2 },
  label: { fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', fontSize: 14 },
  value: { fontFamily: 'BarlowCondensed-Regular', color: '#555', fontSize: 14 },
  statusColumn: { alignItems: 'flex-end', justifyContent: 'flex-start', width: 110, marginTop: -20 },
  badge: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold', textAlign: 'center' },
  actionsRow: { flexDirection: 'row', marginTop: 8, justifyContent: 'flex-end', width: '100%' },
  iconButton: { marginLeft: 15, padding: 8 },
});

export default Pedidos;