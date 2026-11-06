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

Este paquete no requiere npm, compilación ni servidor propio. No incluye metadatos del entorno privado de vista previa.

## 2. Actualizar el proyecto Cloudflare Pages existente

- Repositorio confirmado: https://github.com/jcheva123/showmidget
- Rama principal: `main`.
- Sitio actual informado por Juan: https://showmidgetqr.pages.dev/
- Dominio nuevo registrado en NIC Argentina: `showmidget.ar`.

Usar el proyecto Pages **showmidgetqr** de la cuenta actual. No crear un proyecto nuevo. Revisar en su configuración que la conexión Git apunte a `jcheva123/showmidget`, rama de producción `main`.

Subir a la raíz del repositorio el contenido de este paquete. Mantener la configuración de compilación que ya funciona. Si hace falta configurarla para estos archivos estáticos:

| Campo | Valor |
| --- | --- |
| Rama de producción | `main` |
| Framework preset | `None` |
| Build command | `exit 0` |
| Build output directory | `.` |
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

Abrir `http://localhost:8000/`. Usar servidor local; las rutas empiezan en la raíz del sitio, por lo que abrir `index.html` con doble clic no reproduce el alojamiento web.

## Tipografía

Montserrat se sirve localmente desde `fonts/`. Su licencia se incluye en `fonts/OFL.txt`.

## Documentación del alojamiento

- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
