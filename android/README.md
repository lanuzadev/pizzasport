# PizzaSport POS — app Android (WebView + impresora térmica USB)

Envoltorio nativo mínimo que carga el POS web (`http://<ip-del-servidor>:3000`)
en un WebView de pantalla completa y expone un puente `AndroidPrinter` que el
frontend (`js/utils/printer.js`) usa para imprimir tickets en ESC/POS directo
por USB, sin diálogos del sistema.

## Compilar

1. Abre la carpeta `android/` en Android Studio (Hedgehog o más reciente).
   Deja que sincronice Gradle — generará el wrapper automáticamente si falta.
2. Edita `app/src/main/res/values/strings.xml` → `default_server_url` con la
   IP real de la máquina que corre `node server.js` (o déjalo y configúralo
   luego desde la tablet, ver abajo).
3. Run ▶ sobre la tablet conectada por USB (activa "Depuración USB" en
   Ajustes → Opciones de desarrollador).

## Primer uso en la tablet

- Al conectar la impresora USB por primera vez, Android mostrará un diálogo
  pidiendo permiso para que la app acceda al dispositivo USB — acéptalo
  ("Usar por defecto para este dispositivo" para no repetirlo cada vez).
- Para cambiar la IP del servidor sin recompilar: mantén presionada la
  pantalla ~1s → aparece un diálogo para escribir la nueva URL.
- Botón atrás pide confirmación antes de cerrar la app (para no salir por
  accidente durante un turno de caja).

## Si la impresora no responde

- **`ERR_CLEARTEXT_NOT_PERMITTED`**: no debería pasar — el manifest ya trae
  `usesCleartextTraffic="true"` porque el servidor es HTTP plano.
- **"No se detectó ninguna impresora USB conectada"**: revisa el cable/hub, y
  que la tablet realmente soporte USB host (no todas lo hacen por micro-USB).
- **"No se pudo tomar el control de la interfaz USB"**: alguna otra app
  (un "Print Service" del fabricante, Mopria, etc.) puede tener la impresora
  reclamada a nivel de Android. Desinstala o deshabilita esos servicios de
  impresión — este puente habla con el dispositivo directamente, sin pasar
  por el framework de impresión de Android.
- **Auto-abrir la app al conectar el cable**: descomenta el intent-filter en
  `AndroidManifest.xml` y rellena `res/xml/device_filter.xml` con el
  vendor-id/product-id reales (instrucciones dentro del archivo).

## Contrato del puente (por si se reimplementa distinto)

`js/utils/printer.js` espera en `window.AndroidPrinter` (nombre configurable
desde Ajustes → Ticket en el POS):

```
printBase64(base64: String): String   // JSON síncrono
  {"success":true}
  {"success":false,"error":"mensaje legible para el cajero"}

isConnected(): Boolean                // opcional, solo para el indicador de
                                       // estado en Ajustes
```
