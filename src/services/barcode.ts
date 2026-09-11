import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { isNative } from './platform';

export async function barcodeSupported(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await BarcodeScanner.isSupported()).supported;
  } catch {
    return false;
  }
}

/** Ouvre le scanner natif et renvoie le code lu, ou null si annulé. */
export async function scanBarcode(): Promise<string | null> {
  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== 'granted' && perm.camera !== 'limited') throw new Error('Permission caméra refusée');
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error('Module de scan en cours d’installation, réessaie dans quelques secondes.');
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.Code128],
    });
    return barcodes[0]?.rawValue ?? null;
  } catch (e) {
    if (String(e).toLowerCase().includes('cancel')) return null;
    throw e;
  }
}
