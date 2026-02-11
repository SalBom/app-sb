// src/screens/TableroVendedor.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import authStorage from '../utils/authStorage';

// Flecha del título
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';

// ICONOS de estado
import EstadoPerdidoSvg from '../../assets/EstadoPerdido.svg';
import EstadoRiesgoAltoSvg from '../../assets/EstadoRiesgoAlto.svg';
import EstadoRiesgoMedioSvg from '../../assets/EstadoRiesgoMedio.svg';
import EstadoCompletoSvg from '../../assets/EstadoCompleto.svg';

// Contenedor e ícono de últimos pedidos
import ContenedorUltimosPedidosSvg from '../../assets/ContenedorUltimosPedidos.svg';
import ArrowPedidosSvg from '../../assets/ArrowPedidos.svg';

// Tag azul
import FlechaHeaderAzulSvg from '../../assets/flechaHeaderAzul.svg';

// Botón de gráficos
import GraficosTableroSvg from '../../assets/graficosTablero.svg';

// Historial
import ContenedorHistorialSvg from '../../assets/contenedorHistorial.svg'; 

// === KPI's ===
import ContenedorKPISvg from '../../assets/contenedorKPI.svg';
import ClientesPerdidosSvg from '../../assets/clientesPerdidos.svg';
import ClientesNuevosSvg from '../../assets/clientesNuevos.svg';
import TotalFacturasSvg from '../../assets/totalFacturas.svg';
import TotalPedidosSvg from '../../assets/totalPedidos.svg';
import ClientesAtendidosSvg from '../../assets/clientesAtendidos.svg';

const CARD_HEIGHT = 90;
const ULTIMOS_CARD_HEIGHT = 280; 

// --- AJUSTE DE ALTURAS COMPACTAS ---
const TOP_SECTION_HEIGHT = 330; 
const KPI_BOX_HEIGHT = 225;     

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

type EstadoItem = {
  id: string;
  label: string;
  Icon: React.ComponentType<any>;
};

const ESTADOS: EstadoItem[] = [
  { id: 'perdidos',     label: 'PERDIDOS',     Icon: EstadoPerdidoSvg },
  { id: 'riesgo-medio', label: 'RIESGO MEDIO', Icon: EstadoRiesgoMedioSvg },
  { id: 'riesgo-alto',  label: 'RIESGO ALTO',  Icon: EstadoRiesgoAltoSvg },
  { id: 'completo',     label: 'COMPLETO',     Icon: EstadoCompletoSvg },
];

type FacturaItem = {
  numero_factura: string;
  cliente: string;
  fecha: string;
  total: number;
  estado_pago: string;
};

type KpiData = {
  total_pedidos: number;
  total_facturado: number;
  clientes_nuevos: number;
  clientes_perdidos: number;
  clientes_atendidos: number;
};

const TableroVendedor: React.FC = () => {
  const navigation = useNavigation<any>();

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [pickerVisible, setPickerVisible] = useState(false);

  const [facturas, setFacturas] = useState<FacturaItem[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [errorFacturas, setErrorFacturas] = useState<string | null>(null);

  const [kpiData, setKpiData] = useState<KpiData>({
    total_pedidos: 0,
    total_facturado: 0,
    clientes_nuevos: 0,
    clientes_perdidos: 0,
    clientes_atendidos: 0
  });
  const [loadingKpi, setLoadingKpi] = useState(false);

  const getBaseUrl = () => 'https://app-salbom-production.up.railway.app';

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    const cuit = await authStorage.getCuitFromStorage();
    if (cuit) {
      fetchKpiData(cuit);
      cargarFacturas(cuit);
    }
  };

  const onPressEstado = (id: string) => {
    navigation.navigate('ListadoClientes', { 
      estadoId: id,
      month: selectedMonth,
      year: selectedYear
    });
  };

  const fetchKpiData = async (cuit: string) => {
    try {
      setLoadingKpi(true);
      const res = await fetch(
        `${getBaseUrl()}/kpi-vendedor?cuit=${encodeURIComponent(cuit)}&month=${selectedMonth}&year=${selectedYear}`
      );
      const json = await res.json();

      if (res.ok) {
        setKpiData({
          total_pedidos: json.total_pedidos || 0,
          total_facturado: json.total_facturado || 0,
          clientes_nuevos: json.clientes_nuevos || 0,
          clientes_perdidos: json.clientes_perdidos || 0,
          clientes_atendidos: json.clientes_atendidos || 0,
        });
      }
    } catch (e) {
      console.log('Error KPI', e);
    } finally {
      setLoadingKpi(false);
    }
  };

  const cargarFacturas = async (cuit: string) => {
    try {
      setLoadingFacturas(true);
      setErrorFacturas(null);

      const res = await fetch(
        `${getBaseUrl()}/mis_ventas?cuit=${encodeURIComponent(cuit)}&limit=3&month=${selectedMonth}&year=${selectedYear}`
      );
      const json = await res.json();

      if (!res.ok) {
        setErrorFacturas(json?.error || 'No se pudieron cargar las facturas.');
        return;
      }
      setFacturas((json?.ventas || []) as FacturaItem[]);
    } catch (e) {
      setErrorFacturas('Error de conexión.');
    } finally {
      setLoadingFacturas(false);
    }
  };

  const formatFecha = (f: string | undefined) => {
    if (!f) return '-';
    if (f.includes(' ')) return f.split(' ')[0];
    if (f.includes('T')) return f.split('T')[0];
    return f;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(value);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.container} bounces={false}>
      
      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerTitleRow}>
            <FlechaHeaderSvg width={60} height={36} />
            <Text style={s.title}>TABLERO</Text>
        </View>
        
        <TouchableOpacity 
            style={s.pickerBtn} 
            onPress={() => setPickerVisible(true)}
        >
            <Text style={s.pickerText}>
                {MONTHS[selectedMonth - 1].toUpperCase()} {selectedYear}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#2B2B2B" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      {/* ===== SECCIÓN SUPERIOR ===== */}
      <View style={s.topSectionRow}>
        
        {/* Gráficos con diseño hexagonal */}
        <TouchableOpacity
          style={s.graficosButton}
          activeOpacity={0.8}
        >
          {/* Fondo SVG para forma hexagonal */}
          <ContenedorKPISvg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" />
          <GraficosTableroSvg width="100%" height="100%" preserveAspectRatio="none" />
        </TouchableOpacity>

        {/* Columna Derecha */}
        <View style={s.rightColumn}>

          {/* KPI BOX con diseño hexagonal */}
          <View style={s.kpiShadowContainer}>
            <View style={s.kpiInnerContent}>
                <ContenedorKPISvg 
                  style={StyleSheet.absoluteFill} 
                  width="100%" 
                  height="100%"
                  preserveAspectRatio="none"
                />
                
                <View style={s.kpiPaddingBox}>
                  <Text style={s.kpiTitleInside}>KPI´S DEL MES</Text>
                  
                  {loadingKpi ? (
                    <ActivityIndicator size="small" color="#2B2B2B" style={{flex:1}} />
                  ) : (
                    <View style={s.kpiItemsWrapper}>
                      <TouchableOpacity style={s.kpiItem} onPress={() => onPressEstado('atendidos')}>
                        <ClientesAtendidosSvg width={141} height={18} preserveAspectRatio="xMinYMid meet" />
                        <Text style={s.kpiValueText}>{kpiData.clientes_atendidos}</Text>
                      </TouchableOpacity>
                      <View style={s.kpiItem}>
                        <TotalPedidosSvg width={112} height={18} preserveAspectRatio="xMinYMid meet" />
                        <Text style={s.kpiValueText}>{kpiData.total_pedidos}</Text>
                      </View>
                      <View style={s.kpiItem}>
                        <TotalFacturasSvg width={131} height={18} preserveAspectRatio="xMinYMid meet" />
                        <Text style={s.kpiValueText}>{formatCurrency(kpiData.total_facturado)}</Text>
                      </View>
                      <View style={s.kpiItem}>
                        <ClientesNuevosSvg width={129} height={18} preserveAspectRatio="xMinYMid meet" />
                        <Text style={s.kpiValueText}>{kpiData.clientes_nuevos}</Text>
                      </View>
                      <View style={s.kpiItem}>
                        <ClientesPerdidosSvg width={141} height={18} preserveAspectRatio="xMinYMid meet" />
                        <Text style={s.kpiValueText}>{kpiData.clientes_perdidos}</Text>
                      </View>
                    </View>
                  )}
                </View>
            </View>
          </View>
          
          {/* Historial (Facturas y Pedidos) */}
          <View style={s.historialSection}>
            <TouchableOpacity 
              style={s.historialBtnShadow} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Facturas')}
            >
              <View style={s.historialBtnInner}>
                <ContenedorHistorialSvg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" />
                <View style={s.historialBtnContent}>
                  <Text style={s.historialBtnText}>FACTURAS</Text>
                  <Text style={s.historialArrow}>{'>'}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={s.historialBtnShadow} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Pedidos')}
            >
              <View style={s.historialBtnInner}>
                <ContenedorHistorialSvg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" />
                <View style={s.historialBtnContent}>
                  <Text style={s.historialBtnText}>PEDIDOS</Text>
                  <Text style={s.historialArrow}>{'>'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

        </View>
      </View>

      {/* ===== ESTADOS ===== */}
      <View style={s.estadoShadowWrap}>
        <View style={s.estadoRow}>
          {ESTADOS.map((estado, idx) => {
            const { Icon } = estado;
            return (
              <TouchableOpacity
                key={estado.id}
                style={[s.estadoItem, idx < ESTADOS.length - 1 && s.estadoItemDivider]}
                activeOpacity={0.85}
                onPress={() => onPressEstado(estado.id)}
              >
                <Icon width={40} height={40} />
                <Text style={s.estadoLabel}>{estado.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ===== ULTIMOS PEDIDOS ===== */}
      <View style={s.ultimosSection}>
        <View style={s.ultimosHeaderRow}>
          <FlechaHeaderAzulSvg width={60} height={36} style={s.ultimosTagSvg} />
          <Text style={s.ultimosTitle}>ULTIMOS PEDIDOS</Text>
        </View>

        <View style={s.ultimosShadowWrap}>
          <ContenedorUltimosPedidosSvg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" />
          <View style={s.ultimosContent}>
            {loadingFacturas && <View style={s.ultimosLoading}><ActivityIndicator /></View>}
            {!loadingFacturas && facturas.length === 0 && (
              <View style={s.ultimosEmpty}><Text style={s.ultimosEmptyText}>No hay facturas en este período.</Text></View>
            )}
            {!loadingFacturas && facturas.map((f, idx) => (
                <TouchableOpacity
                  key={f.numero_factura + idx}
                  style={[s.pedidoRow, idx < facturas.length - 1 && s.pedidoRowDivider]}
                  activeOpacity={0.8}
                >
                  <View style={s.pedidoTextWrap}>
                    <Text style={s.pedidoTitle}>FACTURA #{f.numero_factura || '---'}</Text>
                    <Text style={s.pedidoMeta}><Text style={s.pedidoMetaLabel}>CLIENTE: </Text>{f.cliente || 'Desconocido'}</Text>
                    <Text style={s.pedidoMeta}><Text style={s.pedidoMetaLabel}>FECHA: </Text>{formatFecha(f.fecha)}</Text>
                  </View>
                  <View style={s.pedidoArrowWrap}><ArrowPedidosSvg width={18} height={18} /></View>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      </View>

      {/* MODAL FECHA */}
      <Modal visible={pickerVisible} transparent={true} animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setPickerVisible(false)}>
            <View style={s.modalContent}>
                <Text style={s.modalTitle}>Seleccionar Período</Text>
                <View style={s.yearSelector}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {YEARS.map(y => (
                            <TouchableOpacity key={y} style={[s.yearChip, selectedYear === y && s.yearChipActive]} onPress={() => setSelectedYear(y)}>
                                <Text style={[s.yearText, selectedYear === y && s.yearTextActive]}>{y}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
                <View style={s.monthGrid}>
                    {MONTHS.map((m, i) => (
                        <TouchableOpacity key={i} style={[s.monthItem, selectedMonth === (i + 1) && s.monthItemActive]} onPress={() => { setSelectedMonth(i + 1); setPickerVisible(false); }}>
                            <Text style={[s.monthText, selectedMonth === (i + 1) && s.monthTextActive]}>{m.substring(0, 3)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Pressable>
      </Modal>
      
    </ScrollView>
  );
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingBottom: 16, alignItems: 'stretch' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 8, paddingRight: 16 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { marginLeft: 8, fontSize: 28, letterSpacing: 0.6, color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E0E0E0' },
  pickerText: { fontSize: 14, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },

  /* Top Section */
  topSectionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, marginTop: 4, height: TOP_SECTION_HEIGHT },
  graficosButton: {
    marginLeft: 16, 
    height: '100%', 
    width: 173,
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 8,
    position: 'relative',
    overflow: 'visible' 
  },
  rightColumn: { flex: 1, marginLeft: 12, marginRight: 16, height: '100%', justifyContent: 'space-between' },

  /* KPI Box con diseño hexagonal */
  kpiShadowContainer: {
    width: '100%', height: KPI_BOX_HEIGHT, 
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 8,
  },
  kpiInnerContent: { width: '100%', height: '100%' },
  kpiPaddingBox: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  kpiTitleInside: { fontSize: 24, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginBottom: 6, textAlign: 'left', lineHeight: 26 },
  kpiItemsWrapper: { flex: 1, justifyContent: 'space-evenly' },
  kpiItem: { marginBottom: 2 },
  kpiValueText: { fontSize: 14, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginLeft: 4, marginTop: -3 },

  /* Historial */
  historialSection: { justifyContent: 'flex-end', marginTop: 10 },
  historialBtnShadow: {
    width: '100%', height: 44, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 8,
  },
  historialBtnInner: { flex: 1, position: 'relative', justifyContent: 'center' },
  historialBtnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  historialBtnText: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginTop: 2 },
  historialArrow: { fontSize: 20, color: '#2B2B2B', fontWeight: 'bold', marginLeft: 8 },

  /* Estados */
  estadoShadowWrap: { marginTop: 4, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  estadoRow: { height: CARD_HEIGHT, flexDirection: 'row', alignItems: 'center' },
  estadoItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  estadoItemDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#D0D0D0' },
  estadoLabel: { marginTop: 6, fontSize: 12, textAlign: 'center', color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold' },

  /* Ultimos Pedidos */
  ultimosSection: { marginTop: 26 },
  ultimosHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  ultimosTagSvg: { marginRight: 8 },
  ultimosTitle: { fontSize: 24, color: '#2B2B2B', fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.5 },
  ultimosShadowWrap: {
    height: ULTIMOS_CARD_HEIGHT, 
    marginHorizontal: 10, 
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 8,
  },
  ultimosContent: { flex: 1, paddingHorizontal: 18, paddingVertical: 12 },
  ultimosLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ultimosEmpty: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  ultimosEmptyText: { fontSize: 14, color: '#888', fontFamily: 'BarlowCondensed-Bold' },
  pedidoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  pedidoRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E3E3' },
  pedidoTextWrap: { flex: 1 },
  pedidoTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },
  pedidoMeta: { fontSize: 12, color: '#555', marginTop: 1, fontFamily: 'BarlowCondensed-Bold' },
  pedidoMetaLabel: { fontWeight: 'bold' },
  pedidoArrowWrap: { marginLeft: 10 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#FFF', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginBottom: 15, textAlign: 'center' },
  yearSelector: { flexDirection: 'row', marginBottom: 15, height: 40 },
  yearChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5', marginRight: 8, justifyContent: 'center' },
  yearChipActive: { backgroundColor: '#1C9BD8' },
  yearText: { fontFamily: 'BarlowCondensed-Bold', color: '#555' },
  yearTextActive: { color: '#FFF' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  monthItem: { width: '30%', paddingVertical: 10, backgroundColor: '#F5F5F5', borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  monthItemActive: { backgroundColor: '#1C9BD8' },
  monthText: { fontFamily: 'BarlowCondensed-Bold', color: '#555' },
  monthTextActive: { color: '#FFF' }
});

export default TableroVendedor;