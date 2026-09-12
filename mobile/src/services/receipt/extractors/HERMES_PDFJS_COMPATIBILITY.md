# Mozilla PDF.js & React Native Hermes Compatibility Guide

## Executive Summary
This document explains the technical architecture, root causes, and polyfills required to run **Mozilla PDF.js (`pdfjs-dist/legacy`)** natively inside **React Native Hermes** on Android/iOS without crashing or falling back to OCR.

Direct PDF text extraction is **15.2x faster** (~680ms vs ~10,455ms for 11 pages) and preserves exact Indian Rupee (`₹`) symbols and numeric formatting that OCR engines routinely misrecognize (e.g. confusing `₹` with `7`, `2`, or `T`).

> [!CAUTION]
> **CRITICAL MAINTENANCE GUARDRAIL**:
> Do NOT remove `domMatrixPolyfill.ts`, the `WorkerMessageHandler` fake worker pre-configuration, or `isImageDecoderSupported: false` during future package upgrades or refactors. Removing any of these will cause PDF text extraction to crash silently and fall back to slow, error-prone OCR.

---

## The 3 Critical Hermes Incompatibilities & Fixes

### 1. DOMMatrix & Navigator Polyfills (`domMatrixPolyfill.ts`)
- **Problem 1 (DOMMatrix)**:
  `pdfjs-dist` instantiates `const SCALE_MATRIX = new DOMMatrix();` at module load time. React Native/Hermes provides no `window.DOMMatrix` or global `DOMMatrix`.
  - **Resolution**: A minimal 2D/3D affine matrix polyfill with identity matrix defaults, translation, scale, and multiplication methods is registered on `globalThis.DOMMatrix`.
- **Problem 2 (Navigator userAgent & platform)**:
  In Hermes, `navigator` exists but `navigator.userAgent` and `navigator.platform` are `undefined`. `FeatureTest.platform` in `pdf.mjs` executes:
  ```js
  isAndroid: userAgent.includes("Android"),
  isLinux: platform.includes("Linux")
  ```
  This threw `TypeError: Cannot read property 'includes' of undefined`.
  - **Resolution**: `domMatrixPolyfill.ts` safely initializes `navigator.userAgent = ''` and `navigator.platform = ''` if undefined, without overwriting valid values.

---

### 2. structuredClone Null-Options Normalization (`domMatrixPolyfill.ts`)
- **Problem**:
  In `pdf.mjs`, `LoopbackPort.postMessage(obj, transfer)` executes:
  ```js
  const event = {
    data: structuredClone(obj, transfer ? { transfer } : null)
  };
  ```
  When `transfer` is undefined, `pdf.mjs` passes `null` as the 2nd argument (`options`).
  In React Native, `@ungap/structured-clone` polyfills `structuredClone`. Its internal serializer defines:
  ```js
  const serialize = (value, {json, lossy} = {}) => { ... }
  ```
  In JavaScript, default parameter values (`= {}`) only trigger on `undefined`, NOT `null`. Passing `null` caused `serialize` to attempt destructuring `{json, lossy}` of `null`, throwing:
  ```
  TypeError: Cannot read property 'json' of null
  ```
- **Resolution**:
  `domMatrixPolyfill.ts` wraps `globalThis.structuredClone` to normalize `options != null ? options : undefined`. Passing `undefined` allows default destructuring to safely fall back to `{}`.

---

### 3. Dynamic `import()` Prevention & Fake Worker Setup (`PdfTextExtractor.ts`)
- **Problem 1 (Dynamic import in Hermes)**:
  Hermes does NOT support dynamic `import(variable)` expressions. In `pdf.mjs`, `PDFWorker._setupFakeWorkerGlobal` defines a fallback loader:
  ```js
  const loader = async () => {
    if (this.#mainThreadWorkerMessageHandler) {
      return this.#mainThreadWorkerMessageHandler;
    }
    const worker = await import(this.workerSrc);
    return worker.WorkerMessageHandler;
  };
  return shadow(this, "_setupFakeWorkerGlobal", loader());
  ```
  Because `loader()` is called immediately during property access, Hermes' bytecode compiler parses the function body containing `await import(...)` and throws:
  ```
  SyntaxError: ...:Invalid expression encountered
  ```
- **Problem 2 (Missing workerSrc)**:
  In Node.js, `isNodeJS` is true so PDF.js disables workers automatically. In React Native, `isNodeJS` is false, causing PDF.js to throw `No "GlobalWorkerOptions.workerSrc" specified.`
- **Resolution**:
  1. We import `'pdfjs-dist/legacy/build/pdf.worker.mjs'`, which exports and registers `WorkerMessageHandler` onto `globalThis.pdfjsWorker`.
  2. In `PdfTextExtractor.ts`, before calling `pdfjsLib.getDocument()`, we directly configure:
     ```ts
     if ((pdfjsLib as any).PDFWorker && (globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
       Object.defineProperty((pdfjsLib as any).PDFWorker, '_setupFakeWorkerGlobal', {
         value: Promise.resolve((globalThis as any).pdfjsWorker.WorkerMessageHandler),
         configurable: true,
         writable: true,
       });
     }
     ```
     This bypasses the loader getter entirely, ensuring `await import(...)` is never evaluated by Hermes.
  3. We pass `isImageDecoderSupported: false` to `pdfjsLib.getDocument()` to avoid probing unsupported browser image decoder APIs.

---

## Verification & Testing Protocol

When upgrading `pdfjs-dist`, `react-native`, or `expo`:
1. Run static type verification:
   ```bash
   npx tsc --noEmit
   ```
2. Test a real GPay statement PDF on a physical Android device or emulator:
   - Verify `evaluateTextQuality()` returns `isSufficient: true`.
   - Verify `PdfOCRExtractor` is NOT called.
   - Verify modal shows `Direct PDF Text` (`PDF_TEXT`).
   - Verify currency symbols `₹` are intact.
   - Verify zero extraction warnings.
