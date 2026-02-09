import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      // Opcional: Avisar al usuario que no recibirá notificaciones
      // Alert.alert('Aviso', 'No se habilitaron las notificaciones push.');
      return;
    }

    // --- PROYECT ID FIJO ---
    // Asegúrate de que este ID sea el correcto de tu proyecto en Expo Dashboard
    const projectId = "89f3b123-4567-890a-bcde-f01234567890"; // <--- REVISA QUE ESTO SEA TU ID REAL O USA Constants.expoConfig?.extra?.eas?.projectId

    try {
        // Obtenemos el projectId dinámicamente si es posible, sino usa el fijo
        const pid = Constants.expoConfig?.extra?.eas?.projectId || projectId;

        token = (await Notifications.getExpoPushTokenAsync({
            projectId: pid, 
        })).data;
        
        // LIMPIEZA: Comentamos el log del token para producción
        // console.log("🔥 TOKEN:", token); 

    } catch (e) {
        // Dejamos console.error para fallos críticos
        console.error("Error obteniendo push token:", e);
    }
  } else {
    // console.log('Debe usar un dispositivo físico para Push Notifications');
  }

  return token;
}