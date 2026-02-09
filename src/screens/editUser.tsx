import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

// Utils & Auth
import { getCuitFromStorage } from '../utils/authStorage';

// Assets
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';
const AvatarPlaceholder = require('../../assets/avatarPlaceholder.png');

// Config
import { API_URL } from '../config';

const EditUser: React.FC = () => {
  const navigation = useNavigation();

  // Estados del formulario
  const [nombre, setNombre] = useState('');
  const [mail, setMail] = useState('');
  const [telefono, setTelefono] = useState('');
  
  // Imagen
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  // UI States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false); // Nuevo estado para el guardado

  // --- TRAER DATOS AL INICIAR ---
  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const storageCuit = await getCuitFromStorage();
      if (!storageCuit) {
        Alert.alert('Error', 'No se encontró sesión activa.');
        setLoading(false);
        return;
      }

      const url = `${API_URL}/usuario-perfil?cuit=${encodeURIComponent(String(storageCuit))}`;
      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setNombre(data.name || '');
        setMail(data.email || '');
        setTelefono(data.phone || '');
        
        if (data.image_128) {
          setAvatarBase64(data.image_128);
        }
      } else {
        console.log('Error trayendo perfil:', data.error);
      }
    } catch (e) {
      console.log('Error fetchUserData:', e);
    } finally {
      setLoading(false);
    }
  };

  // --- FUNCIÓN PARA GUARDAR CAMBIOS ---
  const handleSave = async () => {
    if (!nombre.trim() || !mail.trim()) {
        Alert.alert("Atención", "El nombre y el mail son obligatorios.");
        return;
    }

    try {
        setSaving(true);
        const storageCuit = await getCuitFromStorage();
        if (!storageCuit) {
            Alert.alert("Error", "No hay sesión activa.");
            return;
        }

        const body = {
            cuit: storageCuit,
            name: nombre,
            email: mail,
            phone: telefono,
            image_128: avatarBase64 // Enviamos la imagen actual (sea nueva o vieja)
        };

        const res = await fetch(`${API_URL}/usuario-perfil/editar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const json = await res.json();

        if (res.ok) {
            Alert.alert("Éxito", "Perfil actualizado correctamente.", [
                { text: "OK", onPress: () => navigation.goBack() }
            ]);
        } else {
            Alert.alert("Error", json.error || "No se pudieron guardar los cambios.");
        }

    } catch (e) {
        Alert.alert("Error", "Fallo de conexión al guardar.");
        console.error(e);
    } finally {
        setSaving(false);
    }
  };

  // Helper para mostrar avatar
  const avatarSource = avatarBase64 
    ? { uri: `data:image/png;base64,${avatarBase64}` }
    : AvatarPlaceholder;

  if (loading) {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1E9CD7" />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingRight: 10 }}>
          <FlechaHeaderSvg width={50} height={36} preserveAspectRatio="xMidYMid meet" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>MI PERFIL</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scrollContent} bounces={false}>
          
          {/* Avatar Section */}
          <View style={s.avatarSection}>
            <View style={s.avatarWrapper}>
              <Image source={avatarSource} style={s.avatarImage} />
              <View style={s.cameraIconBadge}>
                 <Feather name="camera" size={16} color="#FFF" />
              </View>
            </View>
          </View>

          {/* Formulario */}
          <View style={s.formContainer}>
            
            <Text style={s.label}>NOMBRE</Text>
            <View style={s.inputContainer}>
              <TextInput
                style={s.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
                placeholderTextColor="#999"
              />
            </View>

            <Text style={s.label}>MAIL</Text>
            <View style={s.inputContainer}>
              <TextInput
                style={s.input}
                value={mail}
                onChangeText={setMail}
                keyboardType="email-address"
                placeholder="correo@ejemplo.com"
                placeholderTextColor="#999"
                autoCapitalize="none"
              />
            </View>

            <Text style={s.label}>TELÉFONO</Text>
            <View style={s.inputContainer}>
              <TextInput
                style={s.input}
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                placeholder="(+54) ..."
                placeholderTextColor="#999"
              />
            </View>

            {/* Botón Guardar con estado de carga */}
            <TouchableOpacity 
                style={[s.mainButton, saving && { opacity: 0.7 }]} 
                onPress={handleSave}
                disabled={saving}
            >
                {saving ? (
                    <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 10 }} />
                ) : (
                    <>
                        <Text style={s.mainButtonText}>GUARDAR CAMBIOS</Text>
                        <View style={s.separatorVertical} />
                        <Feather name="save" size={20} color="#FFF" />
                    </>
                )}
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 0,
    backgroundColor: '#FAFAFA',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'BarlowCondensed-Bold',
    color: '#2B2B2B',
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#E0E0E0',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#333',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FAFAFA',
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 18,
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 15,
  },
  input: {
    flex: 1,
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 16,
    color: '#555',
    height: '100%',
  },
  mainButton: {
    backgroundColor: '#1E9CD7',
    borderRadius: 25,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 20,
    marginRight: 10,
  },
  separatorVertical: {
    width: 1.5,
    height: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 10,
  }
});

export default EditUser;