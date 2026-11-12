const DB_NAME = "wakefit-sounds";
const DB_VERSION = 1;
const STORE = "sounds";

export interface CustomSoundRecord {
  alarmId: string;
  name: string;
  blob: Blob;
  size: number;
  type: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "alarmId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomSound(alarmId: string, file: File): Promise<CustomSoundRecord> {
  const db = await openDB();
  const record: CustomSoundRecord = {
    alarmId,
    name: file.name,
    blob: file,
    size: file.size,
    type: file.type,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function getCustomSound(alarmId: string): Promise<CustomSoundRecord | null> {
  const db = await openDB();
  const record = await new Promise<CustomSoundRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(alarmId);
    req.onsuccess = () => resolve((req.result as CustomSoundRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record;
}

export async function getCustomSoundUrl(alarmId: string): Promise<string | null> {
  const rec = await getCustomSound(alarmId);
  if (!rec) return null;
  return URL.createObjectURL(rec.blob);
}

export async function deleteCustomSound(alarmId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(alarmId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearCustomSounds(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
