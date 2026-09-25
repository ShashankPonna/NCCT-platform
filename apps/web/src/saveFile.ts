import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

export type SaveFileResult =
  { kind: "downloaded" } | { kind: "saved-to-documents"; fileName: string };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    // result is "data:<mime>;base64,<payload>" — Filesystem wants the payload.
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

// Saves a generated file for the user. In a browser that's a normal
// download; inside the Capacitor app (same web build, docs/DECISIONS.md
// #22) an <a download> click does nothing in the Android/iOS WebView, so the
// file is written to the device's Documents folder instead.
export async function saveFile(blob: Blob, fileName: string): Promise<SaveFileResult> {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Documents,
      recursive: true,
    });
    return { kind: "saved-to-documents", fileName };
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { kind: "downloaded" };
}
