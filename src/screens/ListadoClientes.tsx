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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback
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
import * as DocumentPicker from 'expo-document-picker'; 
import * as ImagePicker from 'expo-image-picker';

import authStorage from '../utils/authStorage';
import { API_URL } from '../config';

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

const IconNote = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F57C00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Path d="M14 2v6h6" />
    <Path d="M16 13H8" />
    <Path d="M16 17H8" />
    <Path d="M10 9H8" />
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

type ChatMessage = {
  id: number;
  body: string;
  date: string;
  author: string;
  attachments: { id: number; name: string; mimetype: string }[];
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

  const { 
    estadoId = 'perdidos', 
    month = new Date().getMonth() + 1, 
    year = new Date().getFullYear(),
    cuitOverride,
    vendorNameOverride 
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

  // Modal Notas
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [selectedClientForNote, setSelectedClientForNote] = useState<Cliente | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string, b64: string } | null>(null);

  // Modal Historial
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchClientes = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      
      const rawBaseUrl = API_URL;
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');

      let url = `${baseUrl}/clientes-por-estado?estado=${estadoId}&month=${month}&year=${year}`;
      
      if (cuitOverride) {
          url += `&cuit=${encodeURIComponent(cuitOverride)}`;
      } else if (vendorNameOverride) {
          url += `&vendor_name=${encodeURIComponent(vendorNameOverride)}`;
      } else {
          const cuitStorage = await authStorage.getCuitFromStorage();
          if (cuitStorage) url += `&cuit=${encodeURIComponent(cuitStorage)}`;
      }

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Error al cargar clientes');
      setClientes(json.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [estadoId, month, year, cuitOverride, vendorNameOverride]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const onRefresh = () => { setRefreshing(true); fetchClientes(true); };

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      const matchSearch = search ? (c.name.toLowerCase().includes(search.toLowerCase()) || (c.vat && c.vat.includes(search))) : true;
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

  const handleOpenNoteModal = (client: Cliente) => {
    setSelectedClientForNote(client);
    setNoteText('');
    setSelectedFile(null); 
    setNoteModalVisible(true);
  };

  const pickFile = () => {
    Keyboard.dismiss(); 
    Alert.alert('Adjuntar Archivo', '¿Qué deseas adjuntar?', [
        {
          text: 'Tomar Foto',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Aviso', 'Se requiere permiso para la cámara.');
            
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.5,
            });
            if (!result.canceled && result.assets.length > 0) {
              const asset = result.assets[0];
              setSelectedFile({ name: asset.uri.split('/').pop() || `foto.jpg`, b64: asset.base64 || '' });
            }
          }
        },
        {
          text: 'Galería',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Aviso', 'Se requiere permiso para las fotos.');

            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All, base64: true, quality: 0.5,
            });
            if (!result.canceled && result.assets.length > 0) {
              const asset = result.assets[0];
              setSelectedFile({ name: asset.uri.split('/').pop() || `galeria.jpg`, b64: asset.base64 || '' });
            }
          }
        },
        {
          text: 'Documento',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
              if (!result.canceled && result.assets.length > 0) {
                  const asset = result.assets[0];
                  const base64 = await FS.readAsStringAsync(asset.uri, { encoding: FS.EncodingType.Base64 });
                  setSelectedFile({ name: asset.name, b64: base64 });
              }
            } catch (e) {}
          }
        },
        { text: 'Cancelar', style: 'cancel' }
    ]);
  };

  const handleSaveNote = async () => {
    if (!selectedClientForNote || (!noteText.trim() && !selectedFile)) return;
    setIsSavingNote(true);
    Keyboard.dismiss();
    try {
      const res = await fetch(`${API_URL}/cliente/nota`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: selectedClientForNote.id, nota: noteText.trim(), file_b64: selectedFile?.b64, file_name: selectedFile?.name
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la nota.');
      Alert.alert('Éxito', 'Nota guardada en el historial del cliente.');
      setNoteModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSavingNote(false);
    }
  };

  // --- LÓGICA CHATTER Y ADJUNTOS ---
  const handleOpenHistoryModal = async (client: Cliente) => {
    setSelectedClientForNote(client);
    setHistoryModalVisible(true);
    setLoadingHistory(true);
    setHistoryMessages([]);
    try {
      const res = await fetch(`${API_URL}/cliente/historial-notas?partner_id=${client.id}`);
      const data = await res.json();
      if (res.ok) {
        setHistoryMessages(data.messages || []);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo conectar al servidor para buscar historial.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDownloadAttachment = (attId: number) => {
    const url = `${API_URL}/adjunto/${attId}`;
    Linking.openURL(url);
  };

  // VERSIÓN MEJORADA: Limpia el HTML a prueba de balas sin perder el texto
  const cleanHtml = (str: string) => {
    if (!str || typeof str !== 'string') return '';
    let text = str;
    
    // 1. Reemplazamos los saltos de línea HTML por saltos reales (\n)
    text = text.replace(/<br\s*[\/]?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    
    // 2. Eliminamos absolutamente cualquier etiqueta HTML restante (<...>)
    text = text.replace(/<[^>]+>/g, '');
    
    // 3. Limpiamos las frases/prefijos automáticos
    text = text.replace(/Nota agregada desde la App:/gi, '');
    text = text.replace(/Archivo adjunto enviado desde la App/gi, '');
    text = text.replace(/Nota desde la App:/gi, '');
    
    // 4. Decodificamos caracteres especiales comunes que Odoo envía
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');

    return text.trim();
  };

  const formatChatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const [d, t] = dateStr.split(' ');
        const [year, month, day] = d.split('-');
        const [hour, min] = t.split(':');
        return `${day}/${month} ${hour}:${min}`;
    } catch { return dateStr; }
  };

  const handleDownloadPdf = async () => { /* Logica Export PDF */ };
  const handleDownloadExcel = async () => { /* Logica Export Excel */ };

  const renderItem = ({ item }: { item: Cliente }) => (
    <TouchableOpacity style={s.rowContainer} onPress={() => handleOpenHistoryModal(item)} activeOpacity={0.7}>
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
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#FFF3E0', marginRight: 10 }]} onPress={() => handleOpenNoteModal(item)}>
            <IconNote />
        </TouchableOpacity>
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
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.headerRow}>
        <View style={s.titleContainer}>
            <Text style={[s.title, { color: config.color }]} numberOfLines={1}>{config.title}</Text>
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

      {/* MODAL NOTA INTERNA */}
      <Modal visible={noteModalVisible} transparent animationType="fade" onRequestClose={() => setNoteModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.modalOverlay} onPress={() => { Keyboard.dismiss(); setNoteModalVisible(false); }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={[s.modalContent, { width: '90%' }]}>
                <Text style={s.modalTitle}>Agregar Nota</Text>
                <Text style={{textAlign:'center', marginBottom:15, color:'#666', fontFamily: 'BarlowCondensed-Regular'}}>Cliente: {selectedClientForNote?.name}</Text>
                <TextInput style={s.noteInput} placeholder="Escribe un comentario..." placeholderTextColor="#999" multiline numberOfLines={4} value={noteText} onChangeText={setNoteText} textAlignVertical="top" />
                
                <TouchableOpacity style={s.attachBtn} onPress={pickFile}>
                  <Ionicons name="camera-outline" size={20} color="#666" />
                  <Text style={s.attachText} numberOfLines={1}>{selectedFile ? selectedFile.name : 'Tomar Foto o Adjuntar'}</Text>
                </TouchableOpacity>
                {selectedFile && (
                    <TouchableOpacity onPress={() => setSelectedFile(null)} style={{alignSelf: 'flex-end', marginBottom: 10}}><Text style={{color: '#D32F2F', fontSize: 12, fontFamily: 'BarlowCondensed-Bold'}}>Quitar archivo</Text></TouchableOpacity>
                )}
                
                <View style={s.noteButtonsRow}>
                    <TouchableOpacity style={s.noteCancelBtn} onPress={() => { Keyboard.dismiss(); setNoteModalVisible(false); }} disabled={isSavingNote}><Text style={s.noteCancelText}>Cancelar</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.noteSaveBtn, { backgroundColor: config.color }]} onPress={handleSaveNote} disabled={isSavingNote || (!noteText.trim() && !selectedFile)}>
                        {isSavingNote ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.noteSaveText}>Guardar</Text>}
                    </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL HISTORIAL DE NOTAS */}
      <Modal visible={historyModalVisible} transparent animationType="fade" onRequestClose={() => setHistoryModalVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setHistoryModalVisible(false)}>
          <Pressable style={[s.modalContent, { width: '95%', maxHeight: '85%', padding: 15, backgroundColor: '#F8F9FA' }]} onPress={e => e.stopPropagation()}>
            <Text style={[s.modalTitle, {marginBottom: 5}]}>Historial de Contacto</Text>
            <Text style={{textAlign:'center', marginBottom:15, color:'#1C9BD8', fontFamily: 'BarlowCondensed-SemiBold'}}>{selectedClientForNote?.name}</Text>

            {loadingHistory ? (
               <ActivityIndicator size="large" color={config.color} style={{ marginVertical: 30 }} />
            ) : (
               <ScrollView style={s.chatScrollContainer} showsVerticalScrollIndicator={false}>

                 {historyMessages.map((msg, idx) => {
                     const isOdoo = msg.author.includes('Odoo');
                     const msgText = cleanHtml(msg.body); // Llamamos a la nueva función
                     
                     return (
                         <View key={msg.id || idx} style={s.chatRow}>
                             <View style={[s.chatAvatar, isOdoo && {backgroundColor: '#6C757D'}]}>
                                 <Text style={s.chatAvatarText}>{msg.author.charAt(0).toUpperCase()}</Text>
                             </View>
                             <View style={s.chatBubble}>
                                 <View style={s.chatHeaderInfo}>
                                     <Text style={s.chatAuthorName} numberOfLines={1}>{msg.author}</Text>
                                     <Text style={s.chatTime}>{formatChatDate(msg.date)}</Text>
                                 </View>
                                 
                                 {/* Texto de la nota (ahora no desaparecerá mágicamente) */}
                                 {!!msgText && (
                                     <Text style={s.chatMessageText}>{msgText}</Text>
                                 )}
                                 
                                 {/* Archivos Adjuntos */}
                                 {msg.attachments && msg.attachments.length > 0 && (
                                     <View style={s.attachmentsWrapper}>
                                         {msg.attachments.map((att: any) => (
                                             <TouchableOpacity 
                                                 key={att.id} 
                                                 style={s.attachmentPill} 
                                                 onPress={() => handleDownloadAttachment(att.id)}
                                                 activeOpacity={0.7}
                                             >
                                                 <Ionicons name="document-attach-outline" size={18} color="#1C9BD8" />
                                                 <Text style={s.attachmentName} numberOfLines={1}>{att.name}</Text>
                                             </TouchableOpacity>
                                         ))}
                                     </View>
                                 )}
                             </View>
                         </View>
                     );
                 })}

                 {historyMessages.length === 0 && (
                     <Text style={s.emptyChatText}>No hay interacciones registradas con este cliente.</Text>
                 )}
               </ScrollView>
            )}

            <TouchableOpacity style={s.closeChatBtn} onPress={() => setHistoryModalVisible(false)}>
                <Text style={s.closeChatText}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 0, marginTop: -10, paddingBottom: 4, backgroundColor: '#fff' },
  titleContainer: { flexDirection: 'row', alignItems: 'baseline', flex: 1, marginRight: 10 },
  title: { fontSize: 22, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.5 },
  countText: { color: '#999', fontSize: 18, marginLeft: 6, fontFamily: 'BarlowCondensed-Regular' },
  exportButtonsRow: { flexDirection: 'row' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  exportText: { marginLeft: 3, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', fontWeight: '700' },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '80%', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', marginBottom: 5, textAlign: 'center', color: '#333' },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalItemText: { fontSize: 16, color: '#333' },
  modalCloseBtn: { marginTop: 15, alignSelf: 'center', padding: 10 },
  modalCloseText: { color: '#D32F2F', fontWeight: 'bold' },
  
  noteInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F9F9F9', minHeight: 100, marginBottom: 10, fontFamily: 'BarlowCondensed-Regular' },
  attachBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', padding: 12, borderRadius: 8, marginBottom: 10 },
  attachText: { marginLeft: 8, color: '#555', flex: 1, fontFamily: 'BarlowCondensed-SemiBold' },
  noteButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteCancelBtn: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, backgroundColor: '#F5F5F5', flex: 1, marginRight: 10, alignItems: 'center' },
  noteCancelText: { color: '#555', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  noteSaveBtn: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, flex: 1, alignItems: 'center' },
  noteSaveText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },

  // --- ESTILOS DEL CHAT ---
  chatScrollContainer: { marginTop: 5, paddingHorizontal: 5 },
  emptyChatText: { textAlign: 'center', color: '#999', fontStyle: 'italic', marginTop: 40 },
  closeChatBtn: { marginTop: 15, backgroundColor: '#E3E3E3', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  closeChatText: { color: '#333', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  
  chatRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', marginRight: 10, marginTop: 2 },
  chatAvatarText: { color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  chatBubble: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, borderTopLeftRadius: 2, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#E0E0E0' },
  chatHeaderInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatAuthorName: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#333', flex: 1, marginRight: 10 },
  chatTime: { fontSize: 11, color: '#999', fontFamily: 'BarlowCondensed-Regular' },
  chatMessageText: { fontSize: 14, color: '#444', lineHeight: 20, fontFamily: 'BarlowCondensed-Regular' },
  
  attachmentsWrapper: { marginTop: 8, gap: 6 },
  attachmentPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E1F5FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#B3E5FC' },
  attachmentName: { marginLeft: 6, color: '#0277BD', fontSize: 12, fontFamily: 'BarlowCondensed-SemiBold', flex: 1 }
});

export default ListadoClientes;