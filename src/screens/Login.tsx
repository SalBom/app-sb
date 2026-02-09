import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  Animated,
  Easing
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import { RootStackParamList } from '../types/navigation';
import { saveUserSession, syncPushToken } from '../utils/authStorage';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import { useCartStore } from '../store/cartStore';
import { API_URL } from '../config'; 

// SVG del Logo
import SBLOGO from '../../assets/SBLOGO.svg';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const Login: React.FC<Props> = ({ navigation }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [cuit, setCuit] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [userNameForLoading, setUserNameForLoading] = useState('');
  const [loading, setLoading] = useState(false);

  const setItems = useCartStore((state: any) => state.setItems);

  const formOpacity = useRef(new Animated.Value(1)).current;
  const logoTranslateY = useRef(new Animated.Value(0)).current;
  const loadingElementsOpacity = useRef(new Animated.Value(0)).current;

  const handleAction = async () => {
    if (!cuit.trim() || !password.trim()) {
      Alert.alert("Atención", "Por favor, completa todos los campos.");
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        Alert.alert("Error", "Las contraseñas no coinciden.");
        return;
      }
      doRegister();
    } else {
      doLogin();
    }
  };

  const doLogin = async () => {
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        cuit: cuit.trim(),
        password: password.trim()
      });

      if (res.data.ok) {
        const name = res.data.name || 'Usuario';
        setUserNameForLoading(name);
        
        await saveUserSession({
          cuit: res.data.cuit,
          role: res.data.role,
          name: name
        });

        // --- RECUPERAR CARRITO SILENCIOSAMENTE ---
        try {
            const resCart = await axios.get(`${API_URL}/cart/load`, { 
                params: { cuit: res.data.cuit } 
            });
            if (resCart.data && Array.isArray(resCart.data.items) && resCart.data.items.length > 0) {
                if (setItems) setItems(resCart.data.items);
            }
        } catch (errCart) {
            // Fallo silencioso si no hay carrito o no hay red, no es critico bloquear el login
        }

        // --- PUSH NOTIFICATIONS ---
        registerForPushNotificationsAsync().then(token => {
            if (token) syncPushToken(token);
        }).catch(() => {}); // Fallo silencioso

        // --- ANIMACIÓN ---
        Animated.timing(formOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }).start();

        Animated.parallel([
          Animated.spring(logoTranslateY, {
            toValue: 100,
            useNativeDriver: true,
            bounciness: 8,
            speed: 10,
          }),
          Animated.timing(loadingElementsOpacity, {
            toValue: 1,
            duration: 500,
            delay: 100,
            useNativeDriver: true,
          }),
        ]).start();

        setTimeout(() => {
          navigation.replace('MainTabs');
        }, 2200);
      }

    } catch (e: any) {
      setLoading(false);
      const status = e.response?.data?.status;
      const msg = e.response?.data?.error || "Error al iniciar sesión";

      if (status === 'PENDING') {
        Alert.alert("Cuenta Pendiente", "Tu solicitud está siendo revisada por la administración.");
      } else {
        Alert.alert("Error", msg);
      }
    }
  };

  const doRegister = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/register`, {
        cuit: cuit.trim(),
        password: password.trim()
      });

      if (res.data.ok) {
        Alert.alert(
          "Solicitud Enviada",
          "Tu cuenta ha sido creada y está pendiente de aprobación.",
          [{ text: "Entendido", onPress: () => toggleMode() }]
        );
      }
    } catch (e: any) {
      const action = e.response?.data?.action;
      const msg = e.response?.data?.error || "Error al registrarse";

      if (action === 'CONTACT_ADMIN') {
        Alert.alert("Acceso Restringido", "El CUIT no figura en nuestra base de clientes.");
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Animated.View style={[styles.logoContainer, { transform: [{ translateY: logoTranslateY }] }]}>
        <SBLOGO width={180} height={180} />
      </Animated.View>

      <Animated.View 
        style={[styles.loadingContainer, { opacity: loadingElementsOpacity }]}
        pointerEvents={loading ? 'auto' : 'none'} 
      >
        <Text style={styles.welcomeText}>¡Bienvenido, {userNameForLoading}!</Text>
        <ActivityIndicator size="large" color="#333" style={{ marginTop: 20 }} />
      </Animated.View>

      <Animated.View style={{ opacity: formOpacity, width: '100%' }}>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>CUIT</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Ingrese su CUIT"
              placeholderTextColor="#545454"
              keyboardType="numeric"
              value={cuit}
              onChangeText={setCuit}
              editable={!loading}
            />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Ingrese la contraseña"
              placeholderTextColor="#545454"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
          </View>
        </View>

        {mode === 'register' && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Confirmar Contraseña</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Repita la contraseña"
                placeholderTextColor="#545454"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleAction}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {mode === 'login' ? 'INGRESAR' : 'SOLICITAR CUENTA'}
          </Text>
        </TouchableOpacity>

        {mode === 'login' && (
          <TouchableOpacity disabled={loading} onPress={() => Alert.alert("Recuperar", "Por favor contacte a administración.")}>
            <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={toggleMode} disabled={loading}>
          <Text style={styles.footer}>
            <Text style={styles.footerText}>
              {mode === 'login' ? "¿No tienes una cuenta? " : "¿Ya tienes cuenta? "}
            </Text>
            <Text style={styles.footerLink}>
              {mode === 'login' ? "Crea una" : "Inicia sesión"}
            </Text>
          </Text>
        </TouchableOpacity>

      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 48,
    alignItems: 'center',
    zIndex: 10,
  },
  loadingContainer: {
    position: 'absolute',
    top: '55%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20, 
  },
  welcomeText: {
    fontFamily: 'Rubik-Regular',
    fontSize: 18,
    color: '#545454',
    textAlign: 'center',
  },
  fieldContainer: {
    marginBottom: 24,
    width: '100%',
  },
  label: {
    fontFamily: 'Rubik-SemiBold',
    fontSize: 15,
    color: '#545454',
    marginBottom: 6,
  },
  inputWrapper: {
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
  },
  input: {
    fontFamily: 'Rubik-Light',
    fontSize: 14,
    paddingHorizontal: 12,
    color: '#545454',
    opacity: 0.85,
  },
  button: {
    backgroundColor: '#1C9BD8',
    borderRadius: 6,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
  },
  buttonText: {
    color: '#FFF',
    fontFamily: 'BarlowCondensed',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  forgot: {
    fontSize: 12,
    color: '#0998D5',
    fontFamily: 'Rubik-Light',
    textAlign: 'center',
    marginBottom: 24,
    width: '100%',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Rubik-Light',
    width: '100%',
    marginTop: 10,
  },
  footerText: {
    color: '#545454',
  },
  footerLink: {
    color: '#0998D5',
    fontFamily: 'Rubik-SemiBold',
  },
});

export default Login;