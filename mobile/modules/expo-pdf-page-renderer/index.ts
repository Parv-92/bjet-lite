import { requireNativeModule } from 'expo-modules-core';

export interface RenderedPageResult {
  imageUri: string;
  filePath: string;
  width: number;
  height: number;
  pageCount: number;
}

let nativeModule: any = null;
try {
  nativeModule = requireNativeModule('ExpoPdfRenderer');
} catch {
  // Gracefully handles environments before native compilation
}

export const isPdfRendererSupported: boolean = !!nativeModule?.isSupported;

export async function getPdfPageCount(pdfUri: string): Promise<number> {
  if (!nativeModule) {
    throw new Error('Native PDF renderer module is not linked.');
  }
  return await nativeModule.getPageCount(pdfUri);
}

export async function renderPdfPageToImage(
  pdfUri: string,
  pageNumber: number
): Promise<RenderedPageResult> {
  if (!nativeModule) {
    throw new Error('Native PDF renderer module is not linked.');
  }
  return await nativeModule.renderPageToImage(pdfUri, pageNumber);
}

export async function cleanupPdfPageImage(filePath: string): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return await nativeModule.cleanupFile(filePath);
  } catch {
    return false;
  }
}

export async function sanitizeTemporaryFiles(olderThanMs: number = 30 * 60 * 1000): Promise<number> {
  if (!nativeModule?.sanitizeTemporaryFiles) return 0;
  try {
    return await nativeModule.sanitizeTemporaryFiles(olderThanMs);
  } catch {
    return 0;
  }
}
