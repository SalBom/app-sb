// src/screens/facturas.tsx
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

// LIBRERÍAS DE EXPORTACIÓN
import * as XLSX from 'xlsx';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import authStorage from '../utils/authStorage';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';
import ContenedorFacturaSvg from '../../assets/contenedorFactura.svg'; 
import FlechaPedidoSvg from '../../assets/flechaPedido.svg';

// Iconos para exportación
import Svg, { Path } from 'react-native-svg';

import { API_URL } from '../config';

const FS = FileSystem as any;

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

type FacturaItem = {
  numero_factura: string;
  cliente: string;
  fecha: string;
  total: number;
  estado_pago: string;
  amount_untaxed?: number; 
  amount_tax?: number;    
};

const PAGE_SIZE = 20;

const Facturas: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>(); 
  const { cuitOverride } = route.params || {}; 

  const [facturas, setFacturas] = useState<FacturaItem[]>([]);
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

  const fetchFacturas = async (currentOffset: number, isRefresh = false) => {
    try {
      const cuit = cuitOverride || await authStorage.getCuitFromStorage();
      if (!cuit) {
        setError('No se encontró CUIT.');
        return;
      }

      const baseUrl = getBaseUrl();
      let url = `${baseUrl}/mis_facturas?cuit=${encodeURIComponent(cuit)}&limit=${PAGE_SIZE}&offset=${currentOffset}`;
      
      if (search.trim()) url += `&q=${encodeURIComponent(search.trim())}`;
      if (dateFilter) url += `&date=${formatDateForBackend(dateFilter)}`;
      if (statusFilter.trim()) url += `&payment_state=${encodeURIComponent(statusFilter.trim())}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || 'Error al cargar facturas');

      const newItems = (json?.items || []) as FacturaItem[];
      setFacturas(isRefresh ? newItems : prev => [...prev, ...newItems]);
      setHasMore(newItems.length >= PAGE_SIZE);

    } catch (e: any) {
      setError('Error de conexión.');
    } finally {
      setLoadingInitial(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchFacturas(0, true); }, []);

  useEffect(() => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
          setLoadingInitial(true); 
          setOffset(0); 
          setHasMore(true);
          fetchFacturas(0, true); 
      }, 500);
      return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [search, dateFilter, statusFilter]); 

  const handleDownloadPdf = async () => {
    try {
      if (facturas.length === 0) return Alert.alert("Aviso", "No hay facturas para exportar.");
      
      const rows = facturas.map(item => `
        <tr>
          <td>${formatFecha(item.fecha)}</td>
          <td>${item.numero_factura}</td>
          <td>${item.cliente}</td>
          <td style="text-align: right;">$ ${formatCurrency(item.amount_untaxed || 0)}</td>
          <td style="text-align: right;">$ ${formatCurrency(item.amount_tax || 0)}</td>
          <td style="text-align: right;">$ ${formatCurrency(item.total)}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica'; padding: 20px; }
              h1 { color: #2B2B2B; font-size: 18px; text-align: center; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th { background-color: #f2f2f2; border: 1px solid #ddd; padding: 8px; text-align: left; }
              td { border: 1px solid #ddd; padding: 8px; }
            </style>
          </head>
          <body>
            <h1>Reporte de Facturación</h1>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Número</th>
                  <th>Partner</th>
                  <th>Imp. s/Imp</th>
                  <th>Impuestos</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) { Alert.alert("Error", "No se pudo generar el PDF."); }
  };

  const handleDownloadExcel = async () => {
    try {
      if (facturas.length === 0) return Alert.alert("Aviso", "No hay facturas para exportar.");
      
      const data = facturas.map(item => ({
        "Fecha": formatFecha(item.fecha),
        "Número": item.numero_factura,
        "Partner": item.cliente,
        "Importe sin impuestos": item.amount_untaxed || 0,
        "Impuestos": item.amount_tax || 0,
        "Total": item.total
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Facturacion");
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = (FS.documentDirectory || FS.cacheDirectory) + `Reporte_Facturacion_${Date.now()}.xlsx`;
      
      await FS.writeAsStringAsync(uri, wbout, { encoding: 'base64' });
      await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } catch (error) { Alert.alert("Error", "No se pudo generar el Excel."); }
  };

  const formatCurrency = (value: number) => value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatFecha = (f: string) => (!f || f === 'Sin fecha' ? '---' : f.split(' ')[0]);

  const renderItem = ({ item }: { item: FacturaItem }) => {
    const pagoInfo = (item.estado_pago === 'paid' || item.estado_pago === 'in_payment' ? { label: 'PAGADO', color: '#CC0000' } : item.estado_pago === 'partial' ? { label: 'PARCIAL', color: '#FF9800' } : { label: 'NO PAGADO', color: '#CC0000' });
    const entregaInfo = (item.fecha && item.fecha !== 'Sin fecha' ? { label: 'ENTREGADO', color: '#4CAF50' } : { label: 'PENDIENTE', color: '#9E9E9E' });
    
    return (
      <View style={s.cardContainer}>
          <ContenedorFacturaSvg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none"/>
          <View style={s.cardContent}>
              <View style={s.cardHeaderRow}>
                  <View style={s.flechaTagContainer}>
                      <FlechaPedidoSvg width={200} height={40} style={StyleSheet.absoluteFill} preserveAspectRatio="none"/>
                      <Text style={s.tagText} numberOfLines={1}>{item.numero_factura.replace('FA-A', '#').substring(0, 18)}</Text>
                  </View>
              </View>
              <View style={s.cardBody}>
                  <View style={s.infoColumn}>
                      <Text style={s.infoRow}><Text style={s.label}>CLIENTE: </Text><Text style={s.value} numberOfLines={1}>{item.cliente}</Text></Text>
                      <Text style={s.infoRow}><Text style={s.label}>FECHA: </Text><Text style={s.value}>{formatFecha(item.fecha)}</Text></Text>
                      <Text style={s.infoRow}><Text style={s.label}>TOTAL: </Text><Text style={s.value}>$ {formatCurrency(item.total)}</Text></Text>
                  </View>
                  <View style={s.statusColumn}>
                      <View style={[s.badge, { backgroundColor: pagoInfo.color }]}><Text style={s.badgeText}>{pagoInfo.label}</Text></View>
                      <View style={[s.badge, { backgroundColor: entregaInfo.color, marginTop: 4 }]}><Text style={s.badgeText}>{entregaInfo.label}</Text></View>
                      <View style={s.actionsRow}>
                          <TouchableOpacity style={s.iconButton} onPress={() => Linking.openURL(`${getBaseUrl()}/factura_pdf?facturaId=${item.numero_factura}`)}><Feather name="download" size={20} color="#2B2B2B" /></TouchableOpacity>
                          <TouchableOpacity style={s.iconButton}><Feather name="info" size={20} color="#2B2B2B" /></TouchableOpacity>
                      </View>
                  </View>
              </View>
          </View>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <View style={s.headerTitleGroup}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
                <FlechaHeaderSvg width={50} height={36} />
            </TouchableOpacity>
            {/* Margen izquierdo agregado para separar del ícono */}
            <Text style={[s.headerTitle, { marginLeft: 12 }]}>FACTURAS</Text>
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
              <TextInput style={s.searchInput} placeholder="BUSCAR" placeholderTextColor="#999" value={search} onChangeText={setSearch}/>
              <Ionicons name="search" size={20} color="#999" style={s.searchIcon} />
           </View>
        </View>
        <View style={s.filtersRow}>
            <TouchableOpacity style={[s.filterInputWrap, { marginRight: 10, flexDirection: 'row', alignItems: 'center' }]} onPress={() => setShowDatePicker(true)}>
                <Text style={[s.filterInput, !dateFilter && { color: '#999' }]}>{dateFilter ? dateFilter.toLocaleDateString('es-AR') : "FECHA"}</Text>
            </TouchableOpacity>
            <View style={s.filterInputWrap}>
                <TextInput style={s.filterInput} placeholder="ESTADO" placeholderTextColor="#999" value={statusFilter} onChangeText={setStatusFilter}/>
            </View>
        </View>
      </View>

      {showDatePicker && <DateTimePicker value={dateFilter || new Date()} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if(d) setDateFilter(d); }} maximumDate={new Date()} />}

      {loadingInitial ? <ActivityIndicator size="large" color="#0088CC" style={{ marginTop: 40 }} /> : (
          <FlatList
            data={facturas}
            keyExtractor={(item, index) => item.numero_factura + index}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            onEndReached={() => hasMore && !loadingMore && fetchFacturas(offset + PAGE_SIZE)}
            onEndReachedThreshold={0.5}
            onRefresh={() => { setRefreshing(true); setOffset(0); fetchFacturas(0, true); }}
            refreshing={refreshing}
          />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, paddingTop: 10, paddingBottom: 10 },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 26, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },
  exportButtonsRow: { flexDirection: 'row' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  exportText: { marginLeft: 3, fontSize: 10, fontFamily: 'BarlowCondensed-Bold' },
  filtersContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchRow: { marginBottom: 8 },
  searchInputWrap: { backgroundColor: '#FFF', borderRadius: 20, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
  searchIcon: { marginLeft: 8 },
  filtersRow: { flexDirection: 'row' },
  filterInputWrap: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, height: 40, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  filterInput: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
  // Se eliminó el paddingHorizontal para que las tarjetas peguen a la izquierda
  listContent: { paddingRight: 16, paddingBottom: 20 },
  // Eliminado marginLeft negativo y se ajustó para alineación total izquierda
  cardContainer: { height: 140, marginBottom: 8, width: '100%' },
  cardContent: { flex: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  flechaTagContainer: { height: 40, width: 220, justifyContent: 'center', paddingLeft: 20 },
  tagText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 18 },
  cardBody: { flexDirection: 'row', paddingHorizontal: 16, justifyContent: 'space-between' },
  infoColumn: { flex: 1 },
  infoRow: { marginTop: 4 },
  label: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13 },
  value: { fontFamily: 'BarlowCondensed-Regular', fontSize: 13 },
  statusColumn: { alignItems: 'flex-end', width: 110 },
  badge: { borderRadius: 12, paddingVertical: 2, minWidth: 90 },
  badgeText: { color: '#FFF', fontSize: 11, fontFamily: 'BarlowCondensed-Bold', textAlign: 'center' },
  actionsRow: { flexDirection: 'row', marginTop: 8 },
  iconButton: { marginLeft: 15 }
});

export default Facturas;