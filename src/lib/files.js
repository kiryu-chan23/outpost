// Saving and copying text. A normal page can start a download; inside a
// sandboxed viewer (e.g. when the app is hosted as a Claude artifact) downloads
// are refused, so we use the host's download capability when it exists and
// otherwise fall back to copying.
let hostDownloads; // undefined = not asked yet, null = not available

async function getHostDownloads() {
  if (hostDownloads !== undefined) return hostDownloads;
  hostDownloads = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') hostDownloads = (await window.claude.use('downloads')) || null;
  } catch {
    hostDownloads = null;
  }
  return hostDownloads;
}

export const isEmbedded = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/** Returns 'saved' | 'declined' | 'unavailable'. Call from a click handler. */
export async function saveTextFile(filename, text, mime = 'text/plain') {
  if (isEmbedded() || (window.claude && window.claude.use)) {
    const dl = await getHostDownloads();
    if (!dl) return 'unavailable';
    try {
      await dl.save({ filename, data: text });
      return 'saved';
    } catch {
      return 'declined';
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** Returns true when the text reached the clipboard. Call from a click handler. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.readAsText(file);
  });
}
