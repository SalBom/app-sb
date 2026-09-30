# Tótem de la expo — Costa Salguero

Pantalla táctil de 32" vertical (1080 × 1920), Windows 10 Pro.

## 1. Abrir la web en modo tótem

En el navegador del tótem, entrar **una vez** a:

```
https://sal-bom.com.ar/?totem=1
```

Queda guardado en ese navegador: aunque después se reinicie, sigue en modo tótem.
Para volver a la web normal, entrar a `https://sal-bom.com.ar/?totem=0`.

## 2. Dejar Chrome en modo kiosko (pantalla completa, sin barras)

Crear un acceso directo en el escritorio con este destino:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --touch-events=enabled --disable-pinch --overscroll-history-navigation=0 "https://sal-bom.com.ar/?totem=1"
```

- `--kiosk`: pantalla completa, sin barra de direcciones ni pestañas.
- `--disable-pinch`: evita que queden haciendo zoom con dos dedos.
- `--overscroll-history-navigation=0`: evita volver atrás arrastrando desde el borde.

Para salir del kiosko: **Alt + F4** (conviene tener un teclado a mano en el stand).

## 3. Windows: que no se apague ni moleste

- **Configuración → Sistema → Energía y suspensión:** pantalla y suspensión en **Nunca**.
- **Protector de pantalla:** desactivado.
- **Configuración → Sistema → Notificaciones:** activar **Asistente de concentración**, así no aparecen avisos encima.
- **Actualizaciones de Windows:** pausarlas por una semana, para que no se reinicie sola en plena expo.
- **Teclado en pantalla** (hace falta para el buscador): Configuración → Dispositivos → **Escritura** → activar *"Mostrar el teclado táctil cuando no haya un teclado conectado"*.

## 4. Qué cambia en la web estando en modo tótem

- Entra directo como **visitante**: sin login, sin carrito y sin precios de oferta (se ven los precios de lista).
- No aparecen el botón **Ingresar**, el **tipo de cambio** ni el pop-up de inicio.
- **No se puede salir del sitio:** el botón de WhatsApp muestra un **QR** para que el visitante siga la charla en su propio celular, y las descargas de fichas y manuales están ocultas.
- **A los 90 segundos sin uso vuelve sola a la pantalla de inicio.**
- Los productos sin precio cargado dicen **"Consultar precio"** en vez de `$0,00`.
- No se puede seleccionar texto, ni abrir el menú del clic derecho, ni ver la flecha del mouse.

## 5. Antes de abrir la expo (5 minutos de prueba)

1. Abrir el acceso directo y ver que arranque en pantalla completa, en el **inicio**.
2. Tocar **Catálogo** y abrir un producto cualquiera.
3. Tocar **Consultar por WhatsApp** y escanear el QR con un celular: tiene que abrir el chat con el producto escrito.
4. Dejar la pantalla quieta 90 segundos y ver que vuelva sola al inicio.
5. Probar el buscador de productos, para confirmar que aparece el teclado en pantalla.

## 6. Si algo falla durante la expo

- **Pantalla trabada o rara:** tocar **F5** (recarga) o **Alt + F4** y volver a abrir el acceso directo.
- **Se ve la web normal, con el botón Ingresar:** se perdió el modo tótem; volver a entrar a `…/?totem=1`.
- **Se abrió otra aplicación encima:** **Alt + F4** hasta volver a Chrome.
- **Sin internet:** la web no carga; el tótem necesita conexión.
