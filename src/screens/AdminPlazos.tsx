import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

import { API_URL } from '../config';

// ⚠️ LISTA EXACTA SOLICITADA
const ALLOWED_IDS = [1, 21, 22, 24, 31];

export default function AdminPlazos() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plazos, setPlazos] = useState<any[]>([]);
  
  const [formValues, setFormValues] = useState<any>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resPlazos = await axios.get(`${API_URL}/plazos-pago`);
      const resConfig = await axios.get(`${API_URL}/admin/plazos-descuentos`);
      const savedConfig = resConfig.data || {};

      if (Array.isArray(resPlazos.data)) {
        // Filtrar solo los IDs deseados
        const filteredList = resPlazos.data.filter((p: any) => ALLOWED_IDS.includes(p.id));
        
        // Ordenar por ID para mantener consistencia visual (1 primero)
        filteredList.sort((a: any, b: any) => a.id - b.id);
        
        setPlazos(filteredList);
        
        const initialValues: any = {};
        filteredList.forEach((p: any) => {
            const saved = savedConfig[p.id] || {};
            initialValues[p.id] = {
                descuento: saved.descuento !== undefined ? String(saved.descuento) : '0',
                descuento2: saved.descuento2 !== undefined ? String(saved.descuento2) : '0',
                min_compra: saved.min_compra !== undefined ? String(saved.min_compra) : '0',
                oferta: saved.oferta === true
            };
        });
        setFormValues(initialValues);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (id: number, field: string, value: any) => {
    setFormValues((prev: any) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const toggleOferta = (id: number) => {
      const current = formValues[id]?.oferta || false;
      handleInputChange(id, 'oferta', !current);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
        const dataToSend = { ...formValues };
        if (dataToSend[1]) dataToSend[1].min_compra = '0'; 

        await axios.post(`${API_URL}/admin/plazos-descuentos`, dataToSend);
        Alert.alert('Éxito', 'Configuración guardada correctamente.');
    } catch (e) {
        Alert.alert('Error', 'No se pudo guardar la configuración.');
    } finally {
        setSaving(false);
    }
  };

  const plazoContado = plazos.find(p => p.id === 1);
  const otrosPlazos = plazos.filter(p => p.id !== 1);

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#1C9BD8" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>PLAZOS Y DESCUENTOS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* --- SECCIÓN PAGO CONTADO (ID 1) --- */}
        {plazoContado && (
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>PAGO CONTADO (ID: 1)</Text>
                
                <View style={styles.rowSingle}>
                    <Text style={styles.label}>1° Descuento (%):</Text>
                    <TextInput 
                        style={styles.inputSingle}
                        keyboardType="numeric"
                        value={formValues[1]?.descuento || ''}
                        onChangeText={(t) => handleInputChange(1, 'descuento', t)}
                        placeholder="0"
                    />
                </View>

                <View style={styles.rowSingle}>
                    <Text style={styles.label}>2° Descuento (%):</Text>
                    <TextInput 
                        style={styles.inputSingle}
                        keyboardType="numeric"
                        value={formValues[1]?.descuento2 || ''}
                        onChangeText={(t) => handleInputChange(1, 'descuento2', t)}
                        placeholder="0"
                    />
                </View>

                {/* CHECKBOX OFERTA */}
                <TouchableOpacity style={styles.rowSingle} onPress={() => toggleOferta(1)}>
                    <Text style={styles.label}>Habilitado en Ofertas:</Text>
                    <Ionicons 
                        name={formValues[1]?.oferta ? "checkbox" : "square-outline"} 
                        size={24} 
                        color={formValues[1]?.oferta ? "#1C9BD8" : "#999"} 
                    />
                </TouchableOpacity>
                
                <Text style={styles.helperText}>
                    Aplica siempre sin mínimo. Escalado: (Precio - Dto1) - Dto2.
                </Text>
            </View>
        )}

        {/* --- TABLA OTROS PLAZOS --- */}
        <View style={styles.card}>
            <Text style={styles.sectionTitle}>OTROS PLAZOS</Text>
            <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>PLAZO</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>DESC.%</Text>
                <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>MINIMO</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>OFERTA</Text>
            </View>
            {otrosPlazos.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.td, { flex: 2 }]}>{item.nombre}</Text>
                    
                    <View style={{ flex: 1, paddingHorizontal: 2 }}>
                        <TextInput 
                            style={styles.inputTable}
                            keyboardType="numeric"
                            value={formValues[item.id]?.descuento || ''}
                            onChangeText={(t) => handleInputChange(item.id, 'descuento', t)}
                            placeholder="0"
                            textAlign="center"
                        />
                    </View>
                    
                    <View style={{ flex: 1.5, paddingHorizontal: 2 }}>
                        <TextInput 
                            style={styles.inputTable}
                            keyboardType="numeric"
                            value={formValues[item.id]?.min_compra || ''}
                            onChangeText={(t) => handleInputChange(item.id, 'min_compra', t)}
                            placeholder="0"
                            textAlign="right"
                        />
                    </View>

                    {/* CHECKBOX */}
                    <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => toggleOferta(item.id)}>
                        <Ionicons 
                            name={formValues[item.id]?.oferta ? "checkbox" : "square-outline"} 
                            size={22} 
                            color={formValues[item.id]?.oferta ? "#1C9BD8" : "#CCC"} 
                        />
                    </TouchableOpacity>
                </View>
            ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>GUARDAR CAMBIOS</Text>}
          </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FFF', elevation: 2 },
  backBtn: { marginRight: 10 },
  title: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, color: '#2B2B2B' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#1C9BD8', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 8 },
  rowSingle: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 16, fontFamily: 'BarlowCondensed-Medium', color: '#333', marginRight: 10, width: 140 },
  inputSingle: { borderWidth: 1, borderColor: '#DDD', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, width: 80, fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#333', textAlign: 'center' },
  helperText: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 5 },
  tableHeader: { flexDirection: 'row', marginBottom: 10, borderBottomWidth: 2, borderBottomColor: '#F0F0F0', paddingBottom: 6 },
  th: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#666' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F7F7F7' },
  td: { fontFamily: 'BarlowCondensed-Regular', fontSize: 14, color: '#333' },
  inputTable: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 4, height: 36, fontSize: 14, fontFamily: 'BarlowCondensed-Medium', color: '#333', backgroundColor: '#FAFAFA' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' },
  saveButton: { backgroundColor: '#1C9BD8', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 18, letterSpacing: 1 }
});