import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Easing,
  ScrollView,
  Keyboard,
  Image
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import { Feather } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { saveUserSession, syncPushToken, saveRememberMe } from '../utils/authStorage';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import { useCartStore } from '../store/cartStore';
import { API_URL } from '../config';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';
import { useGuestStore } from '../store/guestStore';

// SVG del Logo
import SBLOGO from '../../assets/SBLOGO.svg';

// Imagen del panel lateral del login DESKTOP: foto de las 3 herramientas.
const WebLoginImg = require('../../assets/web-home/login_hero.jpg');

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const Login: React.FC<Props> = ({ navigation }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [cuit, setCuit] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  const [userNameForLoading, setUserNameForLoading] = useState('');
  const [loading, setLoading] = useState(false);
  // Mensaje de error inline (Alert.alert no se renderiza en react-native-web,
  // así que el aviso de "usuario/contraseña incorrectos" tiene que ir en pantalla).
  const [errorMsg, setErrorMsg] = useState('');

  const isDesktopWeb = useIsDesktopWeb();

  const setItems = useCartStore((state: any) => state.setItems);
  const enterGuest = useGuestStore((s) => s.enterGuest);

  // Modo invitado: solo en la web (nunca en la APK). Entra al catálogo
  // institucional sin credenciales (sin carrito, stock, ofertas ni dashboard).
  const canBeGuest = Platform.OS === 'web';
  const handleGuest = () => {
    enterGuest();
    navigation.replace('MainTabs');
  };

  // --- ANIMACIONES DE ÉXITO ---
  const formOpacity = useRef(new Animated.Value(1)).current;
  const logoTranslateY = useRef(new Animated.Value(0)).current;
  const loadingElementsOpacity = useRef(new Animated.Value(0)).current;

  // --- ANIMACIÓN DEL TECLADO (ESCALA Y TAMAÑO) ---
  // 0 = Teclado cerrado, 1 = Teclado abierto
  const keyboardAnim = useRef(new Animated.Value(0)).current; 

  useEffect(() => {
    const kbdShow = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
      Animated.timing(keyboardAnim, {
        toValue: 1, 
        duration: 250, 
        // IMPORTANTE: useNativeDriver debe ser false porque animamos 'height' y 'marginBottom'
        useNativeDriver: false, 
        easing: Easing.out(Easing.ease),
      }).start();
    });

    const kbdHide = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      Animated.timing(keyboardAnim, {
        toValue: 0, 
        duration: 300, 
        useNativeDriver: false,
        easing: Easing.out(Easing.ease),
      }).start();
    });
    
    return () => {
      kbdShow.remove();
      kbdHide.remove();
    };
  }, []);

  const handleAction = async () => {
    setErrorMsg('');
    if (!cuit.trim() || !password.trim()) {
      setErrorMsg("Completá el CUIT y la contraseña.");
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setErrorMsg("Las contraseñas no coinciden.");
        return;
      }
      doRegister();
    } else {
      doLogin();
    }
  };

  const doLogin = async () => {
    setLoading(true);
    Keyboard.dismiss(); 

    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        cuit: cuit.trim(),
        password: password.trim()
      });

      if (res.data.ok) {
        const name = res.data.name || 'Usuario';
        setUserNameForLoading(name);

        // Un login real siempre sale del modo invitado (por si venía de navegar
        // el catálogo como visitante).
        useGuestStore.getState().exitGuest();

        await saveUserSession({
          cuit: res.data.cuit,
          role: res.data.role,
          name: name
        });

        await saveRememberMe(rememberMe);

        try {
            const resCart = await axios.get(`${API_URL}/cart/load`, { 
                params: { cuit: res.data.cuit } 
            });
            if (resCart.data && Array.isArray(resCart.data.items) && resCart.data.items.length > 0) {
                if (setItems) setItems(resCart.data.items);
            }
        } catch (errCart) {}

        registerForPushNotificationsAsync().then(token => {
            if (token) syncPushToken(token);
        }).catch(() => {});

        Animated.timing(formOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }).start();

        Animated.parallel([
          Animated.spring(logoTranslateY, {
            toValue: 100,
            useNativeDriver: false, // <--- CORRECCIÓN APLICADA AQUÍ
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

      if (status === 'PENDING') {
        setErrorMsg("Tu cuenta está pendiente de aprobación por la administración.");
      } else if (!e.response) {
        // Sin respuesta del servidor: problema de conexión, no de credenciales.
        setErrorMsg("No pudimos conectar. Revisá tu conexión e intentá de nuevo.");
      } else {
        setErrorMsg("CUIT o contraseña incorrectos. Verificá los datos e intentá de nuevo.");
      }
    }
  };

  const doRegister = async () => {
    setLoading(true);
    Keyboard.dismiss();
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
      const msg = e.response?.data?.error || "No pudimos procesar la solicitud.";

      if (action === 'CONTACT_ADMIN') {
        setErrorMsg("El CUIT no figura en nuestra base de clientes. Contactá a administración.");
      } else if (!e.response) {
        setErrorMsg("No pudimos conectar. Revisá tu conexión e intentá de nuevo.");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setErrorMsg('');
  };

  // ===========================================================================
  // VERSIÓN DESKTOP WEB — layout split moderno (imagen + formulario)
  // ===========================================================================
  if (isDesktopWeb) {
    return (
      <View style={d.screen}>
        {/* Panel izquierdo: imagen a sangre con filtro azul (mismo del Home) */}
        <View style={d.leftPanel}>
          <Image
            source={WebLoginImg}
            style={StyleSheet.absoluteFill as any}
            resizeMode="cover"
          />
          {/* Filtro azul de marca */}
          <View style={d.blueOverlay} />
          {/* Degradado oscuro para legibilidad del texto */}
          <View style={[d.darkGradient, { backgroundImage: 'linear-gradient(180deg, rgba(20,26,32,0.05) 0%, rgba(20,26,32,0.10) 55%, rgba(20,26,32,0.55) 100%)' } as any]} />
          {/* Patrón de puntos sutil (igual estética que el Home) */}
          <View style={[StyleSheet.absoluteFill as any, { backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' } as any]} />

          <View style={d.leftContent}>
            <View style={d.badge}><Text style={d.badgeText}>DESDE 1971</Text></View>
            <Text style={d.leftTitle}>HERRAMIENTAS Y{'\n'}MAQUINARIAS</Text>
            <Text style={d.leftSubtitle}>
              Más de 50 años equipando a la industria argentina con productos de gran calidad y servicio postventa.
            </Text>
          </View>
        </View>

        {/* Panel derecho: formulario */}
        <View style={d.rightPanel}>
          <View style={d.formCard}>
            <View style={d.logoWrap}>
              <SBLOGO width={150} height={150} />
            </View>

            <Text style={d.formTitle}>{mode === 'login' ? 'Iniciar sesión' : 'Solicitar cuenta'}</Text>
            <Text style={d.formSubtitle}>
              {mode === 'login' ? 'Ingresá con tu CUIT y contraseña.' : 'Registrá tu CUIT para solicitar el acceso.'}
            </Text>

            <View style={d.fieldContainer}>
              <Text style={[styles.label, d.fLabel]}>CUIT</Text>
              <View style={d.inputWrapper}>
                <TextInput
                  style={[styles.input, d.fInput]}
                  placeholder="Ingrese su CUIT"
                  placeholderTextColor="#9AA0A6"
                  keyboardType="numeric"
                  value={cuit}
                  onChangeText={setCuit}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={d.fieldContainer}>
              <Text style={[styles.label, d.fLabel]}>Contraseña</Text>
              <View style={d.inputWrapper}>
                <TextInput
                  style={[styles.input, d.fInput]}
                  placeholder="Ingrese la contraseña"
                  placeholderTextColor="#9AA0A6"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                  onSubmitEditing={handleAction}
                />
                <TouchableOpacity style={styles.eyeIconContainer} onPress={() => setShowPassword(!showPassword)} disabled={loading}>
                  <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color="#545454" />
                </TouchableOpacity>
              </View>
            </View>

            {mode === 'register' && (
              <View style={d.fieldContainer}>
                <Text style={[styles.label, d.fLabel]}>Confirmar Contraseña</Text>
                <View style={d.inputWrapper}>
                  <TextInput
                    style={[styles.input, d.fInput]}
                    placeholder="Repita la contraseña"
                    placeholderTextColor="#9AA0A6"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!loading}
                  />
                  <TouchableOpacity style={styles.eyeIconContainer} onPress={() => setShowConfirmPassword(!showConfirmPassword)} disabled={loading}>
                    <Feather name={showConfirmPassword ? 'eye' : 'eye-off'} size={20} color="#545454" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {mode === 'login' && (
              <TouchableOpacity style={d.checkboxContainer} onPress={() => setRememberMe(!rememberMe)} disabled={loading} activeOpacity={0.8}>
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={[styles.checkboxLabel, d.fCheckbox]}>Recordar mis datos de inicio de sesión</Text>
              </TouchableOpacity>
            )}

            {!!errorMsg && (
              <View style={styles.errorBanner}>
                <Feather name="alert-circle" size={16} color="#B91C1C" />
                <Text style={styles.errorBannerText}>{errorMsg}</Text>
              </View>
            )}

            <TouchableOpacity style={[d.button, loading && { opacity: 0.7 }]} onPress={handleAction} disabled={loading} activeOpacity={0.85}>
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={[styles.buttonText, d.fButton]}>{mode === 'login' ? 'INGRESAR' : 'SOLICITAR CUENTA'}</Text>
              )}
            </TouchableOpacity>

            {mode === 'login' && (
              <TouchableOpacity disabled={loading} onPress={() => Alert.alert('Recuperar', 'Por favor contacte a administración.')}>
                <Text style={[styles.forgot, d.fLink]}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={toggleMode} disabled={loading}>
              <Text style={styles.footer}>
                <Text style={[styles.footerText, d.fFooterText]}>{mode === 'login' ? '¿No tienes una cuenta? ' : '¿Ya tienes cuenta? '}</Text>
                <Text style={[styles.footerLink, d.fFooterLink]}>{mode === 'login' ? 'Crea una' : 'Inicia sesión'}</Text>
              </Text>
            </TouchableOpacity>

            {canBeGuest && (
              <View style={d.guestWrap}>
                <View style={d.guestDivider}>
                  <View style={d.guestLine} />
                  <Text style={d.guestOr}>o</Text>
                  <View style={d.guestLine} />
                </View>
                <TouchableOpacity style={d.guestBtn} onPress={handleGuest} disabled={loading} activeOpacity={0.85}>
                  <Feather name="eye" size={18} color="#1C9BD8" />
                  <Text style={d.guestBtnText}>Ver catálogo sin registrarme</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading && userNameForLoading !== '' && (
              <Text style={d.welcomeInline}>¡Bienvenido, {userNameForLoading}!</Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#FFF' }}
    >
      <ScrollView 
        contentContainerStyle={[
          styles.container,
          isKeyboardVisible && { justifyContent: 'flex-start', paddingTop: Platform.OS === 'android' ? 40 : 30 }
        ]} 
        keyboardShouldPersistTaps="handled"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        
        {/* --- LOGO ANIMADO --- */}
        <Animated.View style={[
          styles.logoContainer, 
          { 
            height: keyboardAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [180, 90]
            }),
            marginBottom: keyboardAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [48, 15]
            }),
            transform: [
              { translateY: logoTranslateY }, 
              { scale: keyboardAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.55] 
              })}
            ]
          }
        ]}>
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
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.eyeIconContainer} 
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Feather 
                  name={showPassword ? "eye" : "eye-off"} 
                  size={20} 
                  color="#545454" 
                />
              </TouchableOpacity>
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
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                />
                <TouchableOpacity 
                  style={styles.eyeIconContainer} 
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  <Feather 
                    name={showConfirmPassword ? "eye" : "eye-off"} 
                    size={20} 
                    color="#545454" 
                />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {mode === 'login' && (
            <TouchableOpacity 
              style={styles.checkboxContainer} 
              onPress={() => setRememberMe(!rememberMe)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Recordar mis datos de inicio de sesión</Text>
            </TouchableOpacity>
          )}

          {!!errorMsg && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={16} color="#B91C1C" />
              <Text style={styles.errorBannerText}>{errorMsg}</Text>
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

          {!isKeyboardVisible && (
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
          )}

          {canBeGuest && !isKeyboardVisible && (
            <TouchableOpacity style={styles.guestBtnMobile} onPress={handleGuest} disabled={loading} activeOpacity={0.85}>
              <Feather name="eye" size={18} color="#1C9BD8" />
              <Text style={styles.guestBtnMobileText}>Ver catálogo sin registrarme</Text>
            </TouchableOpacity>
          )}

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, 
    backgroundColor: '#FFF',
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    overflow: 'visible',
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
    flexDirection: 'row', 
    alignItems: 'center', 
  },
  input: {
    flex: 1, 
    fontFamily: 'Rubik-Light',
    fontSize: 14,
    paddingHorizontal: 12,
    color: '#545454',
    opacity: 0.85,
  },
  eyeIconContainer: {
    paddingHorizontal: 15, 
    height: '100%',
    justifyContent: 'center',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#545454',
    borderRadius: 5,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  checkboxChecked: {
    backgroundColor: '#1C9BD8',
    borderColor: '#1C9BD8',
  },
  checkMark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontFamily: 'Rubik-Light',
    fontSize: 14,
    color: '#545454',
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
  guestBtnMobile: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, height: 48, borderRadius: 8, width: '100%',
    borderWidth: 1, borderColor: '#1C9BD8', backgroundColor: '#FFFFFF',
  },
  guestBtnMobileText: { color: '#1C9BD8', fontFamily: 'Rubik-SemiBold', fontSize: 14 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%',
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  errorBannerText: { flex: 1, color: '#B91C1C', fontFamily: 'Rubik', fontSize: 13, lineHeight: 17 },
});

// --- Estilos exclusivos del login DESKTOP (split moderno) ---
const d = StyleSheet.create({
  // row-reverse: el formulario (declarado 2do) queda a la IZQUIERDA y la imagen a la DERECHA.
  screen: { flex: 1, flexDirection: 'row-reverse', backgroundColor: '#FFFFFF' },

  // Panel de imagen — 60% del ancho de la pantalla.
  leftPanel: { width: '60%', backgroundColor: '#141A20', overflow: 'hidden', justifyContent: 'flex-end' },
  blueOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,155,216,0.28)' },
  darkGradient: { ...StyleSheet.absoluteFillObject },
  leftContent: { padding: 64, paddingBottom: 72, maxWidth: 640, zIndex: 2 },
  badge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginBottom: 20,
  },
  badgeText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 2 },
  leftTitle: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 56, lineHeight: 56, textTransform: 'uppercase' },
  leftSubtitle: { color: 'rgba(255,255,255,0.82)', fontFamily: 'Rubik', fontSize: 16, lineHeight: 24, marginTop: 18, maxWidth: 460 },

  // Panel de formulario — ocupa el 40% restante.
  rightPanel: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 },
  formCard: { width: '100%', maxWidth: 380 },
  logoWrap: { alignItems: 'center', marginBottom: 8 },
  formTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 34, color: '#2B2B2B', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  formSubtitle: { fontFamily: 'Rubik', fontSize: 14, color: '#8A8A8A', textAlign: 'center', marginBottom: 28 },

  fieldContainer: { marginBottom: 20, width: '100%' },
  inputWrapper: {
    backgroundColor: '#F6F7F9', borderRadius: 10, height: 50,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#ECEFF2',
  },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, width: '100%' },
  button: {
    backgroundColor: '#1C9BD8', borderRadius: 8, height: 50,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16, width: '100%',
    shadowColor: '#1C9BD8', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  welcomeInline: { fontFamily: 'Rubik', fontSize: 15, color: '#1C9BD8', textAlign: 'center', marginTop: 18 },

  // Acceso invitado (web institucional)
  guestWrap: { width: '100%', marginTop: 18 },
  guestDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  guestLine: { flex: 1, height: 1, backgroundColor: '#ECEFF2' },
  guestOr: { marginHorizontal: 12, fontFamily: 'Rubik', fontSize: 13, color: '#9AA0A6' },
  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderRadius: 8, width: '100%',
    borderWidth: 1, borderColor: '#1C9BD8', backgroundColor: '#FFFFFF',
  },
  guestBtnText: { color: '#1C9BD8', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 0.3 },

  // --- Overrides de fuente: solo usamos las 5 familias realmente cargadas en App.tsx
  //     (Rubik + BarlowCondensed Bold/Regular/Light/SemiBold). Se aplican en arrays
  //     sobre los estilos compartidos para NO tocar la versión mobile. ---
  fLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 14, color: '#3A3F45', letterSpacing: 0.4 },
  fInput: { fontFamily: 'Rubik', fontSize: 15, opacity: 1, color: '#2B2B2B' },
  fButton: { fontFamily: 'BarlowCondensed-Bold', fontSize: 17, letterSpacing: 1.5 },
  fCheckbox: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280' },
  fLink: { fontFamily: 'Rubik', color: '#0998D5' },
  fFooterText: { fontFamily: 'Rubik', color: '#6B7280' },
  fFooterLink: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 0.3, color: '#0998D5' },
});

export default Login;