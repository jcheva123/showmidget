const MAX_VIDEO_BYTES = 5000000;
const MAX_VIDEOS_PER_EVENT = 500;
const VIDEO_NAME = /^showmidget-[0-9a-f-]{36}\.(mp4|webm)$/;
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function videoResult(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const maxEncoded = Math.ceil(MAX_VIDEO_BYTES / 3) * 4;
  if (!e || !e.postData || e.postData.length > maxEncoded + 1024) {
    return videoResult({ error: "invalid" });
  }

  try {
    const payload = JSON.parse(e.postData.contents);
    const properties = PropertiesService.getScriptProperties();
    const key = properties.getProperty("VIDEO_UPLOAD_KEY");
    if (!key || key.length < 32 || payload.key !== key) {
      return videoResult({ error: "unauthorized" });
    }

    const { id, format, video } = payload;
    if (!UPLOAD_ID.test(id) || !["mp4", "webm"].includes(format)
      || typeof video !== "string" || !video.length || video.length > maxEncoded) {
      return videoResult({ error: "invalid" });
    }
    const bytes = Utilities.base64Decode(video);
    if (!bytes.length || bytes.length > MAX_VIDEO_BYTES) {
      return videoResult({ error: "invalid" });
    }

    const folder = DriveApp.getFolderById(properties.getProperty("VIDEO_FOLDER_ID"));
    const name = "showmidget-" + id + "." + format;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return videoResult({ error: "busy" });

    try {
      if (folder.getFilesByName(name).hasNext()) return videoResult({ ok: true });

      const files = folder.getFiles();
      let count = 0;
      while (files.hasNext()) {
        if (VIDEO_NAME.test(files.next().getName())) count += 1;
        if (count >= MAX_VIDEOS_PER_EVENT) return videoResult({ error: "full" });
      }

      folder.createFile(Utilities.newBlob(bytes, "video/" + format, name));
      return videoResult({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error("Error al guardar el video: " + error.message);
    return videoResult({ error: "unavailable" });
  }
}
