(() => {
  const MAX_BYTES = 5_000_000;
  // Deja un margen de unos cuadros para que el contenedor no supere diez segundos.
  const RECORD_MS = 9_800;
  const FORMATS = [
    "video/mp4;codecs=avc1.42001f,mp4a.40.2",
    "video/webm;codecs=vp8,opus",
    "video/mp4",
    "video/webm",
  ];
  const get = (name) => document.getElementById("video-" + name);
  const stage = get("stage");
  const camera = get("camera");
  const preview = get("preview");
  const clock = get("clock");
  const open = get("open");
  const record = get("record");
  const stop = get("stop");
  const actions = get("actions");
  const repeat = get("repeat");
  const send = get("send");
  const consent = get("consent");
  const status = get("status");

  let stream;
  let recorder;
  let clip;
  let previewUrl;
  let uploadId;
  let stopTimer;
  let clockTimer;

  function report(message, success = false) {
    status.textContent = message;
    status.classList.toggle("ok", success);
  }

  function releaseCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    camera.srcObject = null;
    camera.hidden = true;
  }

  function resetClip() {
    preview.pause();
    preview.removeAttribute("src");
    preview.load();
    preview.hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    clip = null;
    uploadId = null;
    actions.hidden = true;
    consent.hidden = true;
  }

  async function openCamera() {
    open.disabled = true;
    repeat.disabled = true;
    send.disabled = true;
    report("Abriendo la cámara y el micrófono…");
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
        audio: true,
      });
      if (document.hidden) {
        opened.getTracks().forEach((track) => track.stop());
        report("Volvé a abrir la cámara para grabar.");
        return;
      }
      stream = opened;
      camera.srcObject = stream;
      camera.hidden = false;
      stage.hidden = false;
      await camera.play();
      if (!stream || document.hidden) throw new Error("Cámara interrumpida");
      resetClip();
      open.hidden = true;
      record.hidden = false;
      report("");
      record.focus();
    } catch {
      releaseCamera();
      stage.hidden = !clip;
      report("No pudimos abrir la cámara y el micrófono. Revisá los permisos del navegador e intentá de nuevo.");
    } finally {
      open.disabled = false;
      repeat.disabled = false;
      send.disabled = false;
    }
  }

  function finishRecording() {
    clearTimeout(stopTimer);
    clearInterval(clockTimer);
    if (recorder?.state === "recording") recorder.stop();
    stop.disabled = true;
  }

  function startRecording() {
    if (!stream?.active) {
      releaseCamera();
      record.hidden = true;
      stage.hidden = true;
      open.hidden = false;
      report("Volvé a abrir la cámara para grabar.");
      return;
    }
    const chunks = [];
    let failed = false;
    try {
      const mimeType = FORMATS.find((format) => MediaRecorder.isTypeSupported(format));
      if (!mimeType) throw new Error("Formato no disponible");
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1_200_000,
        audioBitsPerSecond: 96_000,
      });
      recorder.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data);
      };
      recorder.onerror = () => {
        failed = true;
        finishRecording();
      };
      recorder.onstop = () => {
        clearTimeout(stopTimer);
        clearInterval(clockTimer);
        releaseCamera();
        stop.hidden = true;
        clock.hidden = true;
        const result = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (failed || !result.size || result.size > MAX_BYTES) {
          stage.hidden = true;
          open.hidden = false;
          report(result.size > MAX_BYTES ? "El video supera los 5 MB. Probá con una grabación más corta." : "No se guardó la grabación. Intentá de nuevo.");
          open.focus();
          return;
        }
        clip = result;
        uploadId = crypto.randomUUID();
        previewUrl = URL.createObjectURL(clip);
        preview.src = previewUrl;
        preview.hidden = false;
        actions.hidden = false;
        consent.hidden = false;
        report("");
        send.focus();
      };
      recorder.start();
      const started = performance.now();
      clock.textContent = "0 / 10 s";
      clock.hidden = false;
      record.hidden = true;
      stop.hidden = false;
      stop.disabled = false;
      stop.focus();
      clockTimer = setInterval(() => {
        clock.textContent = Math.min(10, Math.floor((performance.now() - started) / 1000)) + " / 10 s";
      }, 250);
      stopTimer = setTimeout(finishRecording, RECORD_MS);
    } catch {
      releaseCamera();
      record.hidden = true;
      stage.hidden = true;
      open.hidden = false;
      report("No pudimos iniciar la grabación. Intentá con Safari o Chrome actualizado.");
    }
  }

  async function sendClip() {
    if (!clip) return;
    send.disabled = true;
    repeat.disabled = true;
    report("Enviando video…");
    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "X-Upload-Id": uploadId },
        body: clip,
        signal: AbortSignal.timeout(45_000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        report(result.error || "No pudimos confirmar el envío. Podés reintentar.");
        return;
      }
      resetClip();
      stage.hidden = true;
      open.hidden = false;
      report("Video recibido. El equipo lo revisará antes de pasarlo en pantalla.", true);
    } catch {
      report("No pudimos confirmar el envío. Revisá la conexión y reintentá.");
    } finally {
      send.disabled = false;
      repeat.disabled = false;
    }
  }

  open.addEventListener("click", openCamera);
  repeat.addEventListener("click", openCamera);
  record.addEventListener("click", startRecording);
  stop.addEventListener("click", finishRecording);
  send.addEventListener("click", sendClip);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !stream) return;
    if (recorder?.state === "recording") finishRecording();
    releaseCamera();
    if (!record.hidden) {
      record.hidden = true;
      stage.hidden = true;
      open.hidden = false;
    }
  });

  async function loadAvailability() {
    try {
      const response = await fetch("/api/video", { cache: "no-store" });
      if (!response.ok) throw new Error("API no disponible");
      if (!(await response.json()).open) {
        report("Los envíos están cerrados.");
      } else if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !crypto.randomUUID) {
        report("Este navegador no permite grabar acá. Abrí Show Midget en Safari o Chrome actualizado.");
      } else {
        report("");
        open.hidden = false;
      }
    } catch {
      report("No pudimos comprobar si los envíos están abiertos. Recargá la página para reintentar.");
    }
  }

  loadAvailability();
})();
