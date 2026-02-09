import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ScrollView, Modal, FlatList, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import FlechaHeaderSvg from '../../assets/flechaHeader.svg';

import { API_URL } from '../config';

export default function AdminNuevaPromo() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();

  const editPromo = route.params?.promo;
  const isEditing = !!editPromo;

  const [targetType, setTargetType] = useState<'category' | 'product'>('product');
  const [selectedTarget, setSelectedTarget] = useState<{id: number, name: string} | null>(null);
  const [price, setPrice] = useState('');
  const [minQty, setMinQty] = useState('0');
  
  // FECHAS
  const [dateStart, setDateStart] = useState(new Date());
  const [dateEnd, setDateEnd] = useState(new Date());

  // ESTADOS UI
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalList, setModalList] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  
  // ESTADOS PICKER
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime'>('date');
  const [activeField, setActiveField] = useState<'start' | 'end' | null>(null);

  // --- EFECTO: PRECARGAR DATOS ---
  React.useEffect(() => {
      if (isEditing) {
          setTargetType(editPromo.target_type || 'product');
          setSelectedTarget({ id: editPromo.target_id, name: editPromo.name });
          setPrice(String(editPromo.price || 0));
          setMinQty(String(editPromo.min_qty || 0));

          if (editPromo.date_start) {
              const d = new Date(editPromo.date_start.replace(" ", "T") + "Z");
              setDateStart(d);
          }
          if (editPromo.date_end) {
              const d = new Date(editPromo.date_end.replace(" ", "T") + "Z");
              setDateEnd(d);
          }
      }
  }, [editPromo]);

  // --- CARGAR DATOS MODAL ---
  const openSelectionModal = async () => {
      setModalVisible(true);
      setModalLoading(true);
      setModalList([]); 
      try {
          const endpoint = targetType === 'category' ? '/categorias' : '/admin/productos-simple';
          const res = await fetch(`${API_URL}${endpoint}`);
          const data = await res.json();
          if (Array.isArray(data)) setModalList(data);
      } catch (e) {
          Alert.alert("Error", "No se pudieron cargar los datos");
      } finally {
          setModalLoading(false);
      }
  };

  const filteredList = modalList.filter(item => 
      item.name.toLowerCase().includes(modalSearch.toLowerCase())
  );

  // --- GUARDAR ---
  const handleGuardar = async () => {
      if (!selectedTarget) return Alert.alert("Error", "Seleccione Producto/Categoría");
      if (!price) return Alert.alert("Error", "Precio obligatorio");

      setSaving(true);
      try {
          const toOdooUTCString = (d: Date) => {
              const pad = (n: number) => n < 10 ? '0' + n : n;
              return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
          };

          const payload = {
              target_type: targetType,
              target_id: selectedTarget.id,
              price: parseFloat(price),
              min_qty: parseInt(minQty),
              date_start: toOdooUTCString(dateStart),
              date_end: toOdooUTCString(dateEnd)
          };

          let url = `${API_URL}/admin/promociones/crear`;
          let method = 'POST';

          if (isEditing) {
              url = `${API_URL}/admin/promociones/editar/${editPromo.id}`;
              method = 'PUT';
          }

          const res = await fetch(url, {
              method: method,
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
          });
          
          const json = await res.json();
          if (res.ok && json.ok) {
              Alert.alert("Éxito", isEditing ? "Actualizado correctamente" : "Creado correctamente", [
                  { text: "OK", onPress: () => navigation.goBack() }
              ]);
          } else {
              Alert.alert("Error", json.error || "Falló la operación");
          }
      } catch (e) {
          Alert.alert("Error", "Fallo de conexión");
      } finally {
          setSaving(false);
      }
  };

  const handleEliminar = () => {
      Alert.alert(
          "Eliminar Promoción", 
          "¿Estás seguro?",
          [
              { text: "Cancelar", style: "cancel" },
              { text: "Eliminar", style: "destructive", onPress: async () => {
                  setDeleting(true);
                  try {
                      const res = await fetch(`${API_URL}/admin/promociones/eliminar/${editPromo.id}`, { method: 'DELETE' });
                      if (res.ok) navigation.goBack();
                      else Alert.alert("Error", "No se pudo eliminar");
                  } catch { Alert.alert("Error", "Fallo de conexión"); }
                  finally { setDeleting(false); }
              }}
          ]
      );
  };

  // --- PICKER LÓGICA ---
  const startPicking = (field: 'start' | 'end') => {
      setActiveField(field);
      if (Platform.OS === 'android') {
          setPickerMode('date');
      } else {
          setPickerMode('datetime');
      }
      setShowPicker(true);
  };

  const onPickerChange = (event: any, selectedDate?: Date) => {
      if (Platform.OS === 'android') setShowPicker(false);

      if (event.type === 'set' && selectedDate) {
          if (Platform.OS === 'android') {
              if (pickerMode === 'date') {
                  const current = activeField === 'start' ? dateStart : dateEnd;
                  const newDate = new Date(current);
                  newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                  
                  if (activeField === 'start') setDateStart(newDate);
                  else setDateEnd(newDate);

                  setPickerMode('time');
                  setTimeout(() => setShowPicker(true), 50);
              } else {
                  const current = activeField === 'start' ? dateStart : dateEnd;
                  const newDate = new Date(current);
                  newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                  
                  if (activeField === 'start') setDateStart(newDate);
                  else setDateEnd(newDate);
                  setActiveField(null);
              }
          } else {
              if (activeField === 'start') setDateStart(selectedDate);
              else setDateEnd(selectedDate);
          }
      } else {
          if (Platform.OS === 'android') setActiveField(null);
      }
  };

  const displayDateTime = (d: Date) => {
      const pad = (n: number) => n < 10 ? '0' + n : n;
      return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${pad(d.getMinutes())}`;
  };

  return (
    <View style={styles.container}>
      
      {/* HEADER: Con margen superior manual */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
            <FlechaHeaderSvg width={50} height={35} style={{ marginLeft: -5 }} /> 
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{isEditing ? "EDITAR PROMOCIÓN" : "NUEVA PROMOCIÓN"}</Text>
        {isEditing && (
            <TouchableOpacity onPress={handleEliminar} style={styles.deleteBtn}>
                {deleting ? <ActivityIndicator size="small" color="red" /> : <Ionicons name="trash-outline" size={24} color="#E53935" />}
            </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.formContainer}>
          
          <Text style={styles.label}>APLICAR SOBRE:</Text>
          <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeOption, targetType === 'product' && styles.typeOptionActive]}
                onPress={() => { setTargetType('product'); setSelectedTarget(null); }}
              >
                  <Text style={[styles.typeText, targetType === 'product' && styles.typeTextActive]}>PRODUCTO</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.typeOption, targetType === 'category' && styles.typeOptionActive]}
                onPress={() => { setTargetType('category'); setSelectedTarget(null); }}
              >
                  <Text style={[styles.typeText, targetType === 'category' && styles.typeTextActive]}>CATEGORÍA</Text>
              </TouchableOpacity>
          </View>

          <Text style={styles.label}>SELECCIONAR {targetType === 'category' ? 'CATEGORÍA' : 'PRODUCTO'}:</Text>
          <TouchableOpacity style={styles.dropdownButton} onPress={openSelectionModal}>
              <Text style={[styles.dropdownText, !selectedTarget && { color: '#999' }]}>
                  {selectedTarget ? selectedTarget.name : "Toque para seleccionar..."}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>

          <Text style={styles.label}>PRECIO FIJO (USD):</Text>
          <TextInput 
              style={styles.input} 
              keyboardType="numeric" 
              placeholder="0.00" 
              value={price}
              onChangeText={setPrice}
          />

          <Text style={styles.label}>CANTIDAD MÍNIMA:</Text>
          <TextInput 
              style={styles.input} 
              keyboardType="numeric" 
              placeholder="0" 
              value={minQty}
              onChangeText={setMinQty}
          />

          <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.label}>DESDE (Día y Hora):</Text>
                  <TouchableOpacity style={styles.dateInput} onPress={() => startPicking('start')}>
                      <Text style={styles.dateText}>{displayDateTime(dateStart)}</Text>
                      <Ionicons name="calendar-outline" size={18} color="#666" />
                  </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                  <Text style={styles.label}>HASTA (Día y Hora):</Text>
                  <TouchableOpacity style={styles.dateInput} onPress={() => startPicking('end')}>
                      <Text style={styles.dateText}>{displayDateTime(dateEnd)}</Text>
                      <Ionicons name="calendar-outline" size={18} color="#666" />
                  </TouchableOpacity>
              </View>
          </View>

          {showPicker && (
              <DateTimePicker 
                  value={activeField === 'start' ? dateStart : dateEnd} 
                  mode={pickerMode} 
                  display="default" 
                  is24Hour={true}
                  onChange={onPickerChange} 
              />
          )}

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 10) }]}>
          <TouchableOpacity style={styles.btnBack} onPress={() => navigation.goBack()}>
              <Text style={styles.btnBackText}>VOLVER</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.btnConfirm, saving && { opacity: 0.7 }]} 
            onPress={handleGuardar}
            disabled={saving}
          >
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnConfirmText}>{isEditing ? "ACTUALIZAR" : "CONFIRMAR"}</Text>}
          </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide">
          <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
              <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Seleccionar {targetType === 'category' ? 'Categoría' : 'Producto'}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                      <Ionicons name="close" size={28} color="#333" />
                  </TouchableOpacity>
              </View>
              <View style={styles.modalSearch}>
                  <Ionicons name="search" size={20} color="#999" />
                  <TextInput 
                      style={styles.modalSearchInput} 
                      placeholder="Buscar..." 
                      value={modalSearch}
                      onChangeText={setModalSearch}
                  />
              </View>
              {modalLoading ? (
                  <ActivityIndicator size="large" color="#139EDB" style={{ marginTop: 50 }} />
              ) : (
                  <FlatList
                      data={filteredList}
                      keyExtractor={(item) => item.id.toString()}
                      renderItem={({ item }) => (
                          <TouchableOpacity 
                              style={styles.modalItem}
                              onPress={() => {
                                  setSelectedTarget(item);
                                  setModalVisible(false);
                                  setModalSearch('');
                              }}
                          >
                              <Text style={styles.modalItemText}>{item.name}</Text>
                              <Ionicons name="chevron-forward" size={20} color="#CCC" />
                          </TouchableOpacity>
                      )}
                  />
              )}
          </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10,
    paddingRight: 20, 
    marginTop: 20 // <--- Margen manual pequeño para separar del borde
  },
  pageTitle: { fontSize: 24, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', marginLeft: 10, flex: 1 },
  deleteBtn: { padding: 10, backgroundColor: '#FFEBEE', borderRadius: 20 },
  formContainer: { padding: 20, paddingBottom: 100 },
  label: { fontSize: 14, fontFamily: 'BarlowCondensed-Bold', color: '#333', marginBottom: 8, marginTop: 15 },
  typeSelector: { flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 8, padding: 4 },
  typeOption: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  typeOptionActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  typeText: { fontFamily: 'BarlowCondensed-Medium', color: '#666' },
  typeTextActive: { fontFamily: 'BarlowCondensed-Bold', color: '#139EDB' },
  dropdownButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 16, fontFamily: 'BarlowCondensed-Regular', color: '#333' },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 18, fontFamily: 'BarlowCondensed-Regular', color: '#333', backgroundColor: '#FAFAFA' },
  row: { flexDirection: 'row' },
  dateInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, backgroundColor: '#FAFAFA' },
  dateText: { fontSize: 14, fontFamily: 'BarlowCondensed-Regular', color: '#333' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EEE', gap: 10 },
  btnBack: { flex: 1, padding: 14, borderRadius: 25, borderWidth: 1, borderColor: '#DDD', alignItems: 'center' },
  btnBackText: { fontFamily: 'BarlowCondensed-Bold', color: '#333' },
  btnConfirm: { flex: 1, padding: 14, borderRadius: 25, backgroundColor: '#2B2B2B', alignItems: 'center' },
  btnConfirmText: { fontFamily: 'BarlowCondensed-Bold', color: '#FFF' },
  modalContainer: { flex: 1, backgroundColor: '#FFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold' },
  modalSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', margin: 10, padding: 10, borderRadius: 8 },
  modalSearchInput: { flex: 1, marginLeft: 10, fontSize: 16, fontFamily: 'BarlowCondensed-Regular' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F9F9F9' },
  modalItemText: { fontSize: 16, fontFamily: 'BarlowCondensed-Regular', color: '#333' }
});