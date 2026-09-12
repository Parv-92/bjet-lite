/**
 * Bjet Mobile - Hermes / React Native Polyfills for Mozilla PDF.js (Phase 6 / Audit Fix)
 *
 * DO NOT REMOVE OR MODIFY WITHOUT READING:
 * ./HERMES_PDFJS_COMPATIBILITY.md
 *
 * Provides essential runtime compatibility for Mozilla PDF.js (`pdfjs-dist/legacy`) under Hermes:
 * 1. DOMMatrix: Required by pdfjs-dist initialization (`const SCALE_MATRIX = new DOMMatrix()`).
 * 2. navigator.userAgent & platform: Required by FeatureTest.platform (`userAgent.includes()`).
 * 3. structuredClone: Normalizes null options to undefined to prevent @ungap/structured-clone crash.
 */
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: any) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = this.m11 = init[0];
        this.b = this.m12 = init[1];
        this.c = this.m21 = init[2];
        this.d = this.m22 = init[3];
        this.e = this.m41 = init[4];
        this.f = this.m42 = init[5];
      }
    }

    translate(_tx = 0, _ty = 0) { return this; }
    scale(_scaleX = 1, _scaleY = _scaleX) { return this; }
    preMultiplySelf(_other: any) { return this; }
    invertSelf() { return this; }
    multiplySelf(_other: any) { return this; }
  }

  // @ts-ignore
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
  // @ts-ignore
  if (typeof global !== 'undefined' && !(global as any).DOMMatrix) {
    // @ts-ignore
    (global as any).DOMMatrix = DOMMatrixPolyfill;
  }
}

/**
 * Safely polyfill navigator.userAgent and navigator.platform for Hermes / React Native.
 * pdfjs-dist FeatureTest inspects navigator.userAgent.includes() and navigator.platform.includes().
 * In Hermes, navigator exists but userAgent and platform may be undefined.
 */
function polyfillNavigatorProps(nav: any) {
  if (!nav) return;
  if (typeof nav.userAgent === 'undefined') {
    try {
      nav.userAgent = '';
    } catch {
      Object.defineProperty(nav, 'userAgent', {
        value: '',
        configurable: true,
        writable: true,
      });
    }
  }
  if (typeof nav.platform === 'undefined') {
    try {
      nav.platform = '';
    } catch {
      Object.defineProperty(nav, 'platform', {
        value: '',
        configurable: true,
        writable: true,
      });
    }
  }
}

const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : {};
if (typeof globalScope.navigator === 'undefined') {
  globalScope.navigator = {};
}
polyfillNavigatorProps(globalScope.navigator);

try {
  const g: any = (globalThis as any).global;
  if (g && typeof g.navigator !== 'undefined') {
    polyfillNavigatorProps(g.navigator);
  }
} catch {}

/**
 * Safely normalize structuredClone second argument for Hermes / @ungap/structured-clone.
 * Mozilla PDF.js calls `structuredClone(obj, transfer ? { transfer } : null)`.
 * When options is null, @ungap/structured-clone's `serialize(val, {json, lossy} = {})` throws:
 * "TypeError: Cannot read property 'json' of null".
 * Normalizing null to undefined allows default parameter destructuring to safely succeed.
 */
function wrapStructuredClone(target: any) {
  if (!target || typeof target.structuredClone !== 'function') return;
  const original = target.structuredClone;
  target.structuredClone = function (value: any, options?: any) {
    return original(value, options != null ? options : undefined);
  };
}

wrapStructuredClone(globalScope);
try {
  const g: any = (globalThis as any).global;
  if (g) {
    wrapStructuredClone(g);
  }
} catch {}

export {};


