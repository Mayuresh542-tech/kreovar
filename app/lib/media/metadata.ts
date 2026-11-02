export async function readMediaDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const media = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Could not read this media file. Try another format.")), 15000);
      media.onloadedmetadata = () => {
        clearTimeout(timer);
        if (Number.isFinite(media.duration) && media.duration > 0) resolve(media.duration);
        else reject(new Error("This file has no readable duration."));
      };
      media.onerror = () => { clearTimeout(timer); reject(new Error("This media format cannot be read by your browser.")); };
      media.preload = "metadata"; media.src = url;
    });
  } finally { media.removeAttribute("src"); media.load(); URL.revokeObjectURL(url); }
}

