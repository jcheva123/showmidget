# Show Midget · showmidget.ar

Webapp estática del espectáculo del Club Midgistas del Sur. Preparada para publicar desde GitHub con Cloudflare Pages.

## Versión incluida

- Inicio aprobado: botonera de dos columnas, botones del mismo tamaño y acentos por función.
- Encabezado con fecha y main sponsor.
- Tiempos con resultados reales, búsqueda y detalle desplegable de vueltas y recargos.
- Las demás secciones mantienen su diseño y funcionamiento del proyecto original. La unificación visual completa de esas páginas sigue pendiente.
- Definición, Playoffs y Simulador siguen archivados dentro del proyecto, sin acceso desde la botonera principal.

## 1. Subir a GitHub

Descomprimir el ZIP y subir el CONTENIDO de la carpeta `showmidget-github` a la raíz del repositorio. `index.html`, `racing.css`, `evento.js`, `series/` y `tiempos/` deben quedar directamente en esa raíz, sin una carpeta intermedia.

Si se actualiza el repositorio existente, trabajar en una rama y revisar los cambios antes de integrarlos. Conservar la forma habitual de actualizar los archivos de carreras.

La web se aloja en Cloudflare Pages. La función de Video a pantalla requiere las dependencias de npm y la configuración de compilación que figura al final de este documento.

## 2. Actualizar el proyecto Cloudflare Pages existente

- Repositorio confirmado: https://github.com/jcheva123/showmidget
- Rama principal: `main`.
- Sitio actual informado por Juan: https://showmidgetqr.pages.dev/
- Dominio nuevo registrado en NIC Argentina: `showmidget.ar`.

Usar el proyecto Pages **showmidgetqr** de la cuenta actual. No crear un proyecto nuevo. Revisar en su configuración que la conexión Git apunte a `jcheva123/showmidget`, rama de producción `main`.

Subir los archivos a la raíz del repositorio. Para incluir Video a pantalla, usar estos ajustes:

| Campo | Valor |
| --- | --- |
| Rama de producción | `main` |
| Framework preset | `None` |
| Build command | `if [ -f scripts/build-pages.js ]; then npm ci && npm run build; else mkdir -p dist && git archive HEAD \| tar -x -C dist; fi` |
| Build output directory | `dist` |
| Root directory | Dejar vacío: raíz del repositorio |

Verificar el despliegue en `https://showmidgetqr.pages.dev/` antes de vincular el dominio.

## 3. Agregar el dominio a Cloudflare y delegarlo desde NIC Argentina

1. En Cloudflare, agregar el dominio **showmidget.ar** como sitio/zona. Elegir el plan gratuito si alcanza para este proyecto.
2. Cloudflare asignará dos servidores de nombres. Copiar exactamente esos dos nombres; son específicos de la zona.
3. En NIC Argentina, ingresar a la administración de **showmidget.ar** y abrir su opción de **Delegaciones / Delegar**. Cargar los dos servidores asignados por Cloudflare y guardar.
4. No usar “Autodelegar”: se están usando servidores de Cloudflare, no servidores dentro de showmidget.ar.
5. Esperar hasta que Cloudflare detecte la delegación y el dominio figure activo. El registro del dominio permanece en NIC Argentina.

## 4. Vincular el dominio con showmidgetqr

1. En Cloudflare: **Workers & Pages → showmidgetqr → Custom domains → Set up a domain**.
2. Agregar **showmidget.ar** y completar el proceso de configuración DNS que proponga Cloudflare.
3. El destino del registro DNS será **showmidgetqr.pages.dev**. Si ya hay un registro en el dominio raíz que apunta a otra web, revisar ese destino antes de reemplazarlo.
4. Esperar a que el dominio personalizado y el certificado HTTPS figuren activos.
5. Abrir **https://showmidget.ar/** y revisar la app.
6. Opcionalmente agregar `www.showmidget.ar` como segundo dominio personalizado y configurar su redirección hacia el dominio raíz.

No alcanza con crear un CNAME suelto: hay que asociar el dominio desde Custom domains del proyecto Pages. No modificar registros de correo (MX/TXT) al vincular la web. No se incluye un archivo CNAME de GitHub Pages: el alojamiento utilizado es Cloudflare Pages.

La dirección `showmidgetqr.pages.dev` puede seguir funcionando; no es necesario renombrar ni borrar el proyecto. Si hay códigos QR impresos con esa dirección, pueden conservarse. La redirección de la dirección antigua al dominio nuevo se puede configurar después de verificar que el dominio funcione.

## Actualización de cada fecha

Editar `evento.js`:

```js
window.SHOW_MIDGET_EVENT = {
  fecha: "FECHA 4",
  sponsor: "COCA COLA"
};
```

**La configuración conserva FECHA 18 / DARSUR del sitio anterior.** Actualizarla antes de la próxima fecha. El bloque de código de arriba es solo un ejemplo de edición. El encabezado y el título de la pestaña toman esos valores.

Para actualizar el destino del PRODE, cambiar el enlace de `.tone-prediction` en `index.html`. El enlace incluido es el que venía en la app original; verificar que corresponda al evento de Slido vigente.

## Datos e integraciones conservadas

- **Series:** `series/series.js` intenta primero el TXT local `series/Nuevo orden de partida.txt`. Como ese archivo está incluido, se seguirá mostrando hasta que se reemplace con el orden vigente. Luego existen alternativas remotas en `jcheva123/tiemposweb-2025`.
- **Tiempos:** `tiempos/script.js` consulta `resultados` del repositorio `jcheva123/tiemposweb-2025` usando GitHub y mirrors. No confundir el repositorio de datos con el repositorio de esta interfaz.
- **Posiciones:** conserva `posiciones/posiciones.json` y la lógica original.
- **Mensajes:** mantiene el Google Form existente.
- **Selfies:** mantiene el Google Apps Script existente. La confirmación actual de envío es temporizada, heredada de la app original; no verifica que el backend haya guardado la foto.
- **PRODE:** abre Slido.

Cambiar el dominio de la interfaz no mueve estas fuentes de datos ni crea servicios nuevos. Probar un envío real autorizado de mensaje y selfie desde el dominio nuevo antes del evento; aquí no se enviaron contenidos de prueba.

## Revisión antes del estreno

- Fecha, sponsor y enlace de Slido vigentes.
- Orden de partida y posiciones correspondientes a la temporada/fecha correcta.
- Apertura de todas las secciones desde un celular.
- Búsqueda, selección de fecha/carrera y detalle de tiempos.
- Envío de mensajes y selfies desde `https://showmidget.ar`.
- HTTPS activo y revisión de `www`, si se agrega.

## Prueba local

Desde la carpeta del proyecto:

```sh
python3 -m http.server 8000
```

Abrir `http://localhost:8000/` para probar las páginas estáticas. Para probar también `/api/video`, instalar las dependencias con `npm ci`, generar los archivos con `npm run build` y usar `npx wrangler pages dev dist` con las variables del piloto en un archivo local `.dev.vars`. Usar servidor local; las rutas empiezan en la raíz del sitio, por lo que abrir `index.html` con doble clic no reproduce el alojamiento web.

## Tipografía

Montserrat se sirve localmente desde `fonts/`. Su licencia se incluye en `fonts/OFL.txt`.

## Documentación del alojamiento

- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/custom-domains/

## Piloto de Video a pantalla

La página `/video.html` graba desde la cámara frontal, sin audio, y admite hasta
10 segundos, 5 MB por clip y 100 envíos por fecha. El operador revisa los clips
en una carpeta privada y descarga los elegidos para Resolume.

### Google Drive y Apps Script

1. En Drive, crear una carpeta privada para la primera fecha. Copiar su ID
   desde el enlace de la carpeta (la parte que sigue a `/folders/`).
2. Crear un proyecto nuevo en [Apps Script](https://script.google.com/). Pegar
   [Code.gs](apps-script/video/Code.gs) y guardar.
3. En **Configuración del proyecto → Propiedades de secuencia de comandos**,
   agregar `VIDEO_FOLDER_ID` con ese ID y `VIDEO_UPLOAD_KEY` con una clave
   aleatoria de al menos 32 caracteres. Por ejemplo, se puede generar con
   `openssl rand -hex 32`. La clave se guarda solo en Apps Script y Cloudflare.
4. Elegir **Implementar → Nueva implementación → Aplicación web**. En
   **Ejecutar como**, seleccionar la cuenta propietaria de la carpeta. En
   **Quién tiene acceso**, elegir **Cualquier persona**, incluida la opción
   anónima si el menú la distingue. Autorizar el acceso a Drive y copiar
   la URL de la implementación, que termina en `/exec`.

La aplicación web acepta escrituras únicamente con la clave de Cloudflare.
Compartir la carpeta por Drive solo con las cuentas de los operadores.

### Cloudflare Pages

1. En el proyecto **showmidgetqr**, configurar **Build command** como
   el comando de la sección 2 y **Build output directory** como `dist`. El
   comando también genera la web estática cuando la rama no incluye el piloto.
   Mantener la raíz del repositorio como directorio de origen.
2. En **Settings → Variables and Secrets**, agregar estas variables en el
   entorno que se va a probar (Preview o Production).

   | Nombre | Valor |
   | --- | --- |
   | `VIDEO_SCRIPT_URL` | URL `/exec` del nuevo Apps Script. Guardar como secreto. |
   | `VIDEO_UPLOAD_KEY` | Misma clave que en Apps Script. Guardar como secreto. |
   | `VIDEO_ABRE` | Inicio de los envíos en ISO 8601 con hora argentina, por ejemplo `2026-11-13T19:00:00-03:00`. |
   | `VIDEO_CIERRA` | Fin de los envíos, por ejemplo `2026-11-13T23:59:00-03:00`. |

3. Desplegar con las variables ya configuradas. Durante el horario definido,
   abrir `/video.html` desde un iPhone y un Android, grabar y enviar un clip.
   Comprobar que Drive reciba ambos, descargarlos y probarlos en Resolume. Si
   Resolume no abre un WebM, convertirlo a MP4 H.264 antes de cargarlo.
4. Cuando el recorrido esté probado, cambiar `mostrarVideo` a `true` en
   `evento.js` para mostrar el botón VIDEO en la botonera.

Para cada fecha, crear una carpeta privada nueva, actualizar `VIDEO_FOLDER_ID`
en Apps Script y ajustar la ventana horaria en Cloudflare. Mantener los
originales con su nombre en esa carpeta durante el evento para conservar el
cupo y detectar reintentos. Los videos se pueden mover o borrar al terminar.
