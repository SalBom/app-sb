import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, TextInput, Modal
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
// Nota: Dejamos el hook por si lo necesitas luego, pero ya no lo usamos en el estilo
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FlechaHeaderSvg from '../../assets/flechaHeader.svg'; 

import { API_URL } from '../config';

interface PromoItem {
  id: number;
  product_id: number;
  name: string;
  price: number;
  min_qty: number;
  date_start: string | null;
  date_end: string | null;
  status: 'activa' | 'vencida' | 'futura';
  img_url: string;
  target_type?: string;
  target_id?: number;
}

export default function AdminPromociones() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- FILTROS ---
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState<'active' | 'expired'>('active');

  // Modales UI
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  // Orden
  const [sortBy, setSortBy] = useState<'date_start' | 'date_end'>('date_start');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Recargar al entrar
  useFocusEffect(
    useCallback(() => {
      fetchPromos();
    }, [search, selectedMonth, selectedYear, sortBy, sortDir, filterStatus])
  );

  const fetchPromos = async () => {
    try {
      let url = `${API_URL}/admin/promociones?`;
      if (search.trim()) url += `q=${encodeURIComponent(search.trim())}&`;
      
      url += `month=${selectedMonth}&year=${selectedYear}&`;
      url += `sort_by=${sortBy}&order_dir=${sortDir}&`;
      url += `status=${filterStatus}`; 

      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setPromos(data);
      else setPromos([]);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchPromos(); };

  // --- Helpers UI ---
  const toggleSortBy = () => setSortBy(p => p === 'date_start' ? 'date_end' : 'date_start');
  const toggleSortDir = () => setSortDir(p => p === 'asc' ? 'desc' : 'asc');
  const toggleStatus = () => setFilterStatus(p => p === 'active' ? 'expired' : 'active');

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    const d = new Date(s);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  const MONTHS = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const YEARS = [2024, 2025, 2026, 2027]; 

  const renderItem = ({ item }: { item: PromoItem }) => {
    let badgeColor = '#4CAF50';
    let badgeText = 'ACTIVA';
    let cardOpacity = 1;

    if (item.status === 'vencida') {
        badgeColor = '#F44336'; badgeText = 'VENCIDA'; cardOpacity = 0.7;
    } else if (item.status === 'futura') {
        badgeColor = '#FF9800'; badgeText = 'FUTURA';
    }

    return (
      <TouchableOpacity 
        style={[styles.card, { opacity: cardOpacity }]}
        onPress={() => navigation.navigate('AdminNuevaPromo', { promo: item })}
        activeOpacity={0.7}
      >
        {/* HEADER */}
        <View style={styles.cardHeader}>
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
            <Text style={styles.qtyText}>Min: {item.min_qty} u.</Text>
        </View>

        {/* BODY */}
        <View style={styles.cardBody}>
            <View style={styles.infoContainer}>
                <Text style={styles.prodName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.price}>USD {item.price.toFixed(2)}</Text>
            </View>
            
            {/* ÍCONO EDITAR */}
            <View style={styles.editIconWrap}>
                 <Ionicons name="create-outline" size={20} color="#139EDB" />
            </View>
        </View>

        {/* FOOTER */}
        <View style={styles.cardFooter}>
            <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Desde: </Text>
                <Text style={[styles.dateText, sortBy === 'date_start' && styles.highlightText]}>{formatDate(item.date_start)}</Text>
            </View>
            <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Hasta: </Text>
                <Text style={[styles.dateText, sortBy === 'date_end' && styles.highlightText]}>{formatDate(item.date_end)}</Text>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      
      {/* HEADER: Sin marginTop extra */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
            <FlechaHeaderSvg width={50} height={35} style={{ marginLeft: -5 }} /> 
        </TouchableOpacity>
        <Text style={styles.pageTitle}>PROMOCIONES</Text>
      </View>

      <View style={styles.filtersContainer}>
          {/* BUSCADOR */}
          <View style={styles.searchInputWrap}>
              <TextInput 
                style={styles.searchInput}
                placeholder="Buscar producto..."
                placeholderTextColor="#999"
                value={search}
                onChangeText={setSearch}
              />
              <Ionicons name="search" size={20} color="#999" style={{ marginRight: 10 }} />
          </View>

          {/* FILA DE CONTROLES */}
          <View style={styles.filtersRow}>
              
              {/* SELECTOR MES */}
              <TouchableOpacity style={styles.dropdownButton} onPress={() => setShowMonthPicker(true)}>
                  <Text style={styles.dropdownText}>{MONTHS[selectedMonth - 1]}</Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
              </TouchableOpacity>

              {/* SELECTOR AÑO */}
              <TouchableOpacity style={[styles.dropdownButton, { width: 80 }]} onPress={() => setShowYearPicker(true)}>
                  <Text style={styles.dropdownText}>{selectedYear}</Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
              </TouchableOpacity>

              {/* GRUPO DERECHA */}
              <View style={styles.rightButtons}>
                  
                  {/* TOGGLE ESTADO */}
                  <TouchableOpacity 
                    style={[
                        styles.statusButton, 
                        { backgroundColor: filterStatus === 'active' ? '#E8F5E9' : '#FFEBEE' }
                    ]} 
                    onPress={toggleStatus}
                  >
                      <Text style={[
                          styles.statusButtonText, 
                          { color: filterStatus === 'active' ? '#4CAF50' : '#F44336' }
                      ]}>
                          {filterStatus === 'active' ? 'ACTIVAS' : 'VENCIDAS'}
                      </Text>
                  </TouchableOpacity>

                  {/* BOTON NUEVO */}
                  <TouchableOpacity 
                    style={styles.newButton} 
                    onPress={() => navigation.navigate('AdminNuevaPromo')}
                  >
                      <Ionicons name="add" size={18} color="#FFF" />
                      <Text style={styles.newButtonText}>NUEVO</Text>
                  </TouchableOpacity>
              </View>

          </View>

          {/* FILA ORDENAMIENTO */}
          <View style={[styles.filtersRow, { marginTop: 10 }]}>
              <TouchableOpacity style={[styles.sortButton, { flex: 2 }]} onPress={toggleSortBy}>
                  <Text style={styles.sortLabel}>ORDENAR POR:</Text>
                  <Text style={styles.sortValue}>{sortBy === 'date_start' ? 'VIGENTE DESDE' : 'VIGENTE HASTA'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.sortButton, { flex: 1 }]} onPress={toggleSortDir}>
                  <Text style={styles.sortValue}>{sortDir === 'asc' ? 'ASC' : 'DESC'}</Text>
                  <Ionicons name={sortDir === 'asc' ? "arrow-up" : "arrow-down"} size={16} color="#2B2B2B" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
          </View>
      </View>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator size="large" color="#139EDB" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={promos}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
                No hay promociones {filterStatus === 'active' ? 'activas' : 'vencidas'} en este periodo.
            </Text>
          }
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      {/* MODAL MESES */}
      <Modal visible={showMonthPicker} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowMonthPicker(false)}>
              <View style={styles.pickerContainer}>
                  <FlatList 
                      data={MONTHS}
                      keyExtractor={(item) => item}
                      renderItem={({ item, index }) => (
                          <TouchableOpacity 
                              style={styles.pickerItem} 
                              onPress={() => { setSelectedMonth(index + 1); setShowMonthPicker(false); }}
                          >
                              <Text style={[styles.pickerText, selectedMonth === index + 1 && styles.pickerTextActive]}>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
              </View>
          </TouchableOpacity>
      </Modal>

      {/* MODAL AÑOS */}
      <Modal visible={showYearPicker} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowYearPicker(false)}>
              <View style={styles.pickerContainer}>
                  <FlatList 
                      data={YEARS}
                      keyExtractor={(item) => item.toString()}
                      renderItem={({ item }) => (
                          <TouchableOpacity 
                              style={styles.pickerItem} 
                              onPress={() => { setSelectedYear(item); setShowYearPicker(false); }}
                          >
                              <Text style={[styles.pickerText, selectedYear === item && styles.pickerTextActive]}>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  // Sin padding superior en el contenedor principal
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  
  // Sin margin superior en el header (eliminado marginTop: insets.top)
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10, 
    marginTop: 10 // Un mínimo margen fijo por si acaso
  },
  pageTitle: { fontSize: 24, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginLeft: 10, flex: 1 },
  
  filtersContainer: { paddingHorizontal: 16, marginBottom: 15 },
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', height: 44, marginBottom: 10 },
  searchInput: { flex: 1, paddingHorizontal: 15, fontSize: 16, fontFamily: 'BarlowCondensed-Medium', color: '#333' },
  filtersRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  
  // DROPDOWNS
  dropdownButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: '#FFF', paddingVertical: 8, paddingHorizontal: 10,
      borderRadius: 12, borderWidth: 1, borderColor: '#DDD', width: 95
  },
  dropdownText: { fontSize: 12, fontFamily: 'BarlowCondensed-Bold', color: '#333', textTransform: 'uppercase' },

  // GRUPO DERECHA
  rightButtons: { flexDirection: 'row', marginLeft: 'auto', gap: 8 },

  statusButton: {
      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, 
      alignItems: 'center', justifyContent: 'center'
  },
  statusButtonText: { fontSize: 12, fontFamily: 'BarlowCondensed-Bold' },

  newButton: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#139EDB',
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, gap: 4
  },
  newButtonText: { fontSize: 14, fontFamily: 'BarlowCondensed-Bold', color: '#FFF' },

  sortButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
      height: 40, paddingHorizontal: 10
  },
  sortLabel: { fontSize: 10, fontFamily: 'BarlowCondensed-Regular', color: '#666', marginRight: 4 },
  sortValue: { fontSize: 12, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' },

  // CARD
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, borderWidth: 1, borderColor: '#F0F0F0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  qtyText: { fontSize: 12, color: '#666', fontFamily: 'BarlowCondensed-Medium' },

  // BODY & ICON
  cardBody: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 
  },
  infoContainer: { flex: 1, paddingRight: 15 },
  prodName: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#333', lineHeight: 20 },
  price: { fontSize: 20, fontWeight: '800', color: '#2B2B2B', marginTop: 4 },
  
  editIconWrap: {
      padding: 8, backgroundColor: '#F5F9FF', borderRadius: 25, marginBottom: 2
  },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateLabel: { fontSize: 12, color: '#999', fontFamily: 'BarlowCondensed-Medium' },
  dateText: { fontSize: 12, color: '#333', fontFamily: 'BarlowCondensed-Medium' },
  highlightText: { color: '#139EDB', fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 16, color: '#999', marginTop: 40 },

  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: 250, maxHeight: 300, backgroundColor: '#FFF', borderRadius: 10, padding: 10 },
  pickerItem: { paddingVertical: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  pickerText: { fontSize: 16, fontFamily: 'BarlowCondensed-Medium', color: '#333' },
  pickerTextActive: { color: '#139EDB', fontWeight: 'bold' }
});