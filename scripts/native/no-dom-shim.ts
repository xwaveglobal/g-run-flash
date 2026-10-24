/**
 * A minimal no-DOM runtime for the smoke test, shaped like the v3 native adapter (main:
 * src/native/adapter.ts): no window / document; `document.createElement('canvas')` gives a runtime
 * canvas (here OffscreenCanvas, natively tt.createCanvas), images are runtime image objects
 * (here ImageBitmap-backed, natively tt.createImage), storage is in memory. Loaded FIRST.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const G: any = globalThis;
const noop = () => {};
export const shimLog: string[] = [];

function canvasLike(w = 1, h = 1): any {
  const c: any = new OffscreenCanvas(w, h);
  c.style = {};
  c.addEventListener = noop;
  c.removeEventListener = noop;
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: c.width, height: c.height });
  return c;
}
/** runtime image: loads through fetch + createImageBitmap; drawImage / texImage2D unwrap it */
function makeImage(): any {
  const evs: Record<string, ((e: any) => void)[]> = { load: [], error: [] };
  const im: any = { style: {}, width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: false, __bitmap: null, onload: null, onerror: null };
  im.addEventListener = (t: string, cb: any) => (evs[t] ??= []).push(cb);
  im.removeEventListener = (t: string, cb: any) => (evs[t] = (evs[t] ?? []).filter((f) => f !== cb));
  Object.defineProperty(im, 'src', {
    set(url: string) {
      shimLog.push('image ' + url.slice(0, 40));
      fetch(url)
        .then((r) => r.blob())
        .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }))
        .then((bm) => {
          im.__bitmap = bm;
          im.width = im.naturalWidth = bm.width;
          im.height = im.naturalHeight = bm.height;
          im.complete = true;
          im.onload?.({ type: 'load', target: im });
          for (const f of evs.load.slice()) f.call(im, { type: 'load', target: im });
        })
        .catch((e) => {
          im.onerror?.(e);
          for (const f of evs.error.slice()) f.call(im, e);
        });
    },
    get() {
      return '';
    },
  });
  return im;
}
const unwrap = (a: any) => (a && a.__bitmap ? a.__bitmap : a);
for (const P of [OffscreenCanvasRenderingContext2D.prototype] as any[]) {
  const d = P.drawImage;
  P.drawImage = function (img: any, ...r: any[]) {
    return d.call(this, unwrap(img), ...r);
  };
}
for (const P of [WebGL2RenderingContext.prototype] as any[]) {
  for (const k of ['texImage2D', 'texSubImage2D']) {
    const f = P[k];
    P[k] = function (...a: any[]) {
      return f.apply(this, a.map(unwrap));
    };
  }
}
const el = (tag = 'div'): any => ({
  tagName: tag.toUpperCase(),
  style: {},
  dataset: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: (x: any) => x,
  removeChild: (x: any) => x,
  setAttribute: noop,
  addEventListener: noop,
  removeEventListener: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
  clientWidth: 360,
  clientHeight: 640,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
});
const createElement = (t: string) => (String(t).toLowerCase() === 'canvas' ? canvasLike() : String(t).toLowerCase() === 'img' ? makeImage() : el(t));
G.document = { createElement, createElementNS: (_n: string, t: string) => createElement(t), body: el('body'), addEventListener: noop, removeEventListener: noop, hidden: false };
G.window = G;
G.Image = function Image() {
  return makeImage();
};
G.devicePixelRatio = 2;
G.innerWidth = 360;
G.innerHeight = 640;
const mem = new Map<string, string>();
G.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k) };
G.addEventListener ??= noop;
