import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  TextInput,
  ScrollView,
  Switch
} from 'react-native';
import axios from 'axios';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { API_URL } from '../config'; // <--- IMPORTACIÓN CENTRALIZADA

const KEYS = {
    HOME: 'FEATURED_HOME',
    PRODUCTOS: 'FEATURED_PRODUCTOS'
};

const LIMIT = 20;

export default function AdminBanners() {
  const navigation = useNavigation();
  
  const [currentSection, setCurrentSection] = useState<'HOME' | 'PRODUCTOS' | 'POPUP'>('HOME');
  const [popupSubTab, setPopupSubTab] = useState<'TC' | 'NEW'>('TC');

  const [search, setSearch] = useState('');
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);

  const [loadingPopup, setLoadingPopup] = useState(false);
  const [popupTCConfig, setPopupTCConfig] = useState({
      enabled: false,
      rate: '',
      date: ''
  });

  const [popupNewConfig, setPopupNewConfig] = useState({
      enabled: false,
      products: [] as any[]
  });

  useEffect(() => {
    if (currentSection === 'POPUP') {
        fetchPopupTCConfig();
        fetchPopupNewConfig();
    } else {
        loadFeaturedListFromDB();
        if (productos.length === 0) fetchProducts(true);
    }
  }, [currentSection]);

  useEffect(() => {
      if (currentSection === 'POPUP' && popupSubTab === 'NEW') {
          setSelectedProducts(popupNewConfig.products || []);
          if (productos.length === 0) fetchProducts(true);
      }
  }, [popupSubTab, currentSection, popupNewConfig]);

  const loadFeaturedListFromDB = async () => {
    try {
      const dbKey = KEYS[currentSection as 'HOME' | 'PRODUCTOS']; 
      if (!dbKey) return;

      const res = await axios.get(`${API_URL}/config/${dbKey}`);
      
      if (Array.isArray(res.data)) {
          setSelectedProducts(res.data);
      } else {
          setSelectedProducts([]);
      }
    } catch(e) { 
      // Silencioso
    }
  };

  const saveFeaturedListToDB = async (newList: any[]) => {
      try {
          const dbKey = KEYS[currentSection as 'HOME' | 'PRODUCTOS'];
          if (!dbKey) return;
          await axios.post(`${API_URL}/config/${dbKey}`, newList);
      } catch (e) {
          Alert.alert("Error", "No se pudieron guardar los cambios en el servidor.");
      }
  };

  const fetchPopupTCConfig = async () => {
      try {
          const res = await axios.get(`${API_URL}/config/popup_tc`);
          if (res.data) {
              setPopupTCConfig({
                  enabled: res.data.enabled === true,
                  rate: res.data.rate || '',
                  date: res.data.date || ''
              });
          }
      } catch (e) { }
  };

  const savePopupTCConfig = async () => {
      setLoadingPopup(true);
      try {
          await axios.post(`${API_URL}/config/popup_tc`, popupTCConfig);
          Alert.alert("Guardado", "PopUp TC actualizado para todos.");
      } catch (e) { Alert.alert("Error", "No se pudo guardar."); } 
      finally { setLoadingPopup(false); }
  };

  const fetchPopupNewConfig = async () => {
      try {
          const res = await axios.get(`${API_URL}/config/popup_new_arrivals`);
          if (res.data) {
              setPopupNewConfig({
                  enabled: res.data.enabled === true,
                  products: res.data.products || []
              });
          }
      } catch (e) { }
  };

  const savePopupNewConfig = async () => {
      setLoadingPopup(true);
      try {
          const dataToSave = {
              enabled: popupNewConfig.enabled,
              products: selectedProducts
          };
          await axios.post(`${API_URL}/config/popup_new_arrivals`, dataToSave);
          setPopupNewConfig(dataToSave);
          Alert.alert("Guardado", "PopUp Nuevos Ingresos actualizado.");
      } catch (e) { Alert.alert("Error", "No se pudo guardar."); }
      finally { setLoadingPopup(false); }
  };

  const fetchProducts = async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const { data } = await axios.get(`${API_URL}/productos`, {
        params: { search: search, limit: LIMIT, offset: currentOffset }
      });
      const newItems = Array.isArray(data) ? data : (data.items || []);
      if (reset) {
        setProductos(newItems);
        setOffset(LIMIT);
      } else {
        setProductos(prev => [...prev, ...newItems]);
        setOffset(prev => prev + LIMIT);
      }
      setHasMore(newItems.length === LIMIT);
    } catch (e) { } finally { setLoading(false); }
  };

  const handleSearch = () => fetchProducts(true);
  const handleLoadMore = () => { if (hasMore && !loading) fetchProducts(false); };
  const safeStr = (str: any) => (str !== null && str !== undefined ? String(str) : '');

  const toggleSelect = async (item: any) => {
    let newList = [...selectedProducts];
    const index = newList.findIndex(p => p.id === String(item.id)); 
    
    if (index >= 0) {
        newList.splice(index, 1);
    } else {
        if (newList.length >= 5) { Alert.alert('Límite alcanzado', 'Máximo 5 productos.'); return; }
        
        let categoryName = 'General';
        if (Array.isArray(item.categ_id) && item.categ_id.length > 1) {
            const fullPath = item.categ_id[1];
            const parts = fullPath.split('/');
            categoryName = parts.length >= 2 ? parts[1].trim() : (parts.length > 0 ? parts[0].trim() : 'General');
        }
        newList.push({
            id: safeStr(item.id),
            img: safeStr(item.image_md_url || item.image_thumb_url),
            name: safeStr(item.name),
            sku: safeStr(item.default_code),
            cat: safeStr(categoryName),
            brandRaw: safeStr(item.brand || item.marca || item.name) 
        });
    }
    
    setSelectedProducts(newList);

    if (currentSection !== 'POPUP') {
        await saveFeaturedListToDB(newList);
    }
  };

  const renderProductItem = ({ item }: any) => {
    const isSelected = selectedProducts.some(p => p.id === String(item.id));
    const imgUrl = item.image_md_url || item.image_thumb_url;
    return (
      <TouchableOpacity style={[styles.card, isSelected && styles.cardSelected]} onPress={() => toggleSelect(item)} activeOpacity={0.7}>
        <Image source={imgUrl ? { uri: imgUrl } : null} style={styles.img} contentFit="contain" />
        <View style={styles.infoCol}>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.code}>{item.default_code || 'SIN SKU'}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>CONFIGURACIÓN DE HOME</Text>
      </View>

      {/* --- TABS PRINCIPALES --- */}
      <View style={styles.tabsContainer}>
          {['HOME', 'PRODUCTOS', 'POPUP'].map((tab) => (
              <TouchableOpacity 
                key={tab}
                style={[styles.tab, currentSection === tab && styles.tabActive]} 
                onPress={() => {
                    setCurrentSection(tab as any);
                    setSearch(''); 
                }}
              >
                  <Text style={[styles.tabText, currentSection === tab && styles.tabTextActive]}>
                      {tab === 'POPUP' ? 'POPUPS' : tab}
                  </Text>
              </TouchableOpacity>
          ))}
      </View>

      {/* --- CONTENIDO --- */}
      {currentSection === 'POPUP' ? (
          <View style={{ flex: 1 }}>
              <View style={styles.subTabsContainer}>
                  <TouchableOpacity 
                      style={[styles.subTab, popupSubTab === 'TC' && styles.subTabActive]} 
                      onPress={() => setPopupSubTab('TC')}
                  >
                      <Text style={[styles.subTabText, popupSubTab === 'TC' && styles.subTabTextActive]}>TIPO DE CAMBIO</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                      style={[styles.subTab, popupSubTab === 'NEW' && styles.subTabActive]} 
                      onPress={() => setPopupSubTab('NEW')}
                  >
                      <Text style={[styles.subTabText, popupSubTab === 'NEW' && styles.subTabTextActive]}>NUEVOS INGRESOS</Text>
                  </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20 }}>
                  {popupSubTab === 'TC' && (
                      <View style={styles.configCard}>
                          <Text style={styles.sectionTitle}>POPUP TIPO DE CAMBIO</Text>
                          <View style={styles.rowSwitch}>
                              <Text style={styles.label}>Activar PopUp:</Text>
                              <Switch 
                                  value={popupTCConfig.enabled}
                                  onValueChange={(val) => setPopupTCConfig(prev => ({...prev, enabled: val}))}
                                  trackColor={{ false: "#E0E0E0", true: "#81b0ff" }}
                                  thumbColor={popupTCConfig.enabled ? "#1C9BD8" : "#f4f3f4"}
                              />
                          </View>
                          <View style={styles.inputGroup}>
                              <Text style={styles.label}>Valor del Dólar ($):</Text>
                              <TextInput 
                                  style={styles.inputSingle} 
                                  value={popupTCConfig.rate}
                                  onChangeText={(t) => setPopupTCConfig(prev => ({...prev, rate: t}))}
                                  placeholder="Ej: 1485"
                                  keyboardType="numeric"
                              />
                          </View>
                          <View style={styles.inputGroup}>
                              <Text style={styles.label}>Fecha Vigencia:</Text>
                              <View style={styles.dateInputContainer}>
                                  <Ionicons name="calendar-outline" size={20} color="#666" style={{ marginRight: 10 }} />
                                  <TextInput 
                                      style={[styles.inputSingle, { flex: 1, borderWidth: 0, paddingHorizontal: 0 }]} 
                                      value={popupTCConfig.date}
                                      onChangeText={(t) => setPopupTCConfig(prev => ({...prev, date: t}))}
                                      placeholder="DD/MM/AAAA"
                                  />
                              </View>
                          </View>
                          <TouchableOpacity 
                              style={[styles.saveBtn, loadingPopup && { opacity: 0.7 }]} 
                              onPress={savePopupTCConfig}
                              disabled={loadingPopup}
                          >
                              {loadingPopup ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>GUARDAR TC</Text>}
                          </TouchableOpacity>
                      </View>
                  )}

                  {popupSubTab === 'NEW' && (
                      <View>
                          <View style={styles.configCard}>
                              <Text style={styles.sectionTitle}>POPUP NUEVOS INGRESOS</Text>
                              <View style={styles.rowSwitch}>
                                  <Text style={styles.label}>Activar PopUp:</Text>
                                  <Switch 
                                      value={popupNewConfig.enabled}
                                      onValueChange={(val) => setPopupNewConfig(prev => ({...prev, enabled: val}))}
                                      trackColor={{ false: "#E0E0E0", true: "#81b0ff" }}
                                      thumbColor={popupNewConfig.enabled ? "#1C9BD8" : "#f4f3f4"}
                                  />
                              </View>
                              <View style={styles.infoBar}>
                                  <Text style={{ color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold' }}>
                                      PRODUCTOS: {selectedProducts.length} / 5
                                  </Text>
                              </View>
                              <View style={styles.searchBox}>
                                  <TextInput 
                                      style={styles.input} 
                                      placeholder="Buscar para agregar..." 
                                      value={search}
                                      onChangeText={setSearch}
                                      onSubmitEditing={handleSearch}
                                  />
                                  <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
                                      <Ionicons name="search" size={22} color="#FFF" />
                                  </TouchableOpacity>
                              </View>
                              <TouchableOpacity 
                                  style={[styles.saveBtn, loadingPopup && { opacity: 0.7 }]} 
                                  onPress={savePopupNewConfig}
                                  disabled={loadingPopup}
                              >
                                  {loadingPopup ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>GUARDAR INGRESOS</Text>}
                              </TouchableOpacity>
                          </View>
                          <View style={{ paddingBottom: 40 }}>
                              {productos.map((item) => (
                                  <View key={item.id}>
                                      {renderProductItem({ item })}
                                  </View>
                              ))}
                              {hasMore && (
                                  <TouchableOpacity onPress={handleLoadMore} style={{padding: 10, alignItems:'center'}}>
                                      <Text style={{color:'#999'}}>Cargar más...</Text>
                                  </TouchableOpacity>
                              )}
                          </View>
                      </View>
                  )}
              </ScrollView>
          </View>
      ) : (
          <>
            <View style={styles.infoBar}>
                <Text style={{ color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold' }}>
                    SELECCIONADOS: {selectedProducts.length} / 5
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                    (Se guardan automáticamente)
                </Text>
            </View>
            <View style={styles.searchBox}>
                <TextInput 
                    style={styles.input} 
                    placeholder="Buscar producto..." 
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={handleSearch}
                />
                <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
                    <Ionicons name="search" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>
            <FlatList
                data={productos}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderProductItem}
                contentContainerStyle={{ padding: 16 }}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loading ? <ActivityIndicator size="small" color="#1C9BD8" style={{ marginVertical: 20 }} /> : null}
                ListEmptyComponent={!loading && productos.length === 0 ? <Text style={{textAlign:'center', marginTop: 20, color:'#999'}}>No se encontraron productos.</Text> : null}
            />
          </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FFF', elevation: 2 },
  backBtn: { marginRight: 10 },
  title: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, color: '#2B2B2B' },
  tabsContainer: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#1C9BD8' },
  tabText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#999' },
  tabTextActive: { color: '#1C9BD8' },
  subTabsContainer: { flexDirection: 'row', backgroundColor: '#F0F9FF', padding: 4, margin: 10, borderRadius: 8 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  subTabActive: { backgroundColor: '#FFFFFF', elevation: 1 },
  subTabText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#666' },
  subTabTextActive: { color: '#1C9BD8' },
  configCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, marginBottom: 20, elevation: 2, flexDirection: 'column' },
  sectionTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#1C9BD8', marginBottom: 20, marginTop: 5, textAlign: 'center' },
  rowSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontFamily: 'BarlowCondensed-Medium', color: '#333', marginBottom: 8 },
  inputSingle: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, backgroundColor: '#FAFAFA', color: '#333', fontFamily: 'BarlowCondensed-Bold' },
  dateInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 14, backgroundColor: '#FAFAFA' },
  saveBtn: { backgroundColor: '#1C9BD8', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
  saveBtnText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 20, letterSpacing: 1 },
  helperText: { marginTop: 20, textAlign: 'center', color: '#888', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 10 },
  infoBar: { backgroundColor: '#E0F2F1', padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, borderRadius: 8, marginBottom: 10 },
  searchBox: { flexDirection: 'row', padding: 0, marginBottom: 15 },
  input: { flex: 1, backgroundColor: '#FAFAFA', borderRadius: 10, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: '#E0E0E0', fontSize: 16 },
  searchBtn: { width: 50, height: 50, backgroundColor: '#1C9BD8', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 12, elevation: 1 },
  cardSelected: { borderColor: '#1C9BD8', borderWidth: 2, backgroundColor: '#F0F9FF' },
  img: { width: 60, height: 60, backgroundColor: '#F5F5F5', borderRadius: 6 },
  infoCol: { flex: 1, paddingHorizontal: 12 },
  name: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#333' },
  code: { fontFamily: 'BarlowCondensed-Regular', fontSize: 14, color: '#666' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#1C9BD8', borderColor: '#1C9BD8' }
});