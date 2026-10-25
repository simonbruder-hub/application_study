/**
 * Komplexe LU-Zerlegung mit Spaltenpivotsuche für die kleinen, dichten MNA-Gleichungssysteme.
 * Reelle Systeme laufen über denselben Weg mit Imaginärteil 0.
 */

export class CMatrix {
  readonly re: Float64Array;
  readonly im: Float64Array;
  constructor(readonly n: number) {
    this.re = new Float64Array(n * n);
    this.im = new Float64Array(n * n);
  }
  add(r: number, c: number, re: number, im = 0) {
    const k = r * this.n + c;
    this.re[k]! += re;
    this.im[k]! += im;
  }
}

export interface LU {
  n: number;
  re: Float64Array;
  im: Float64Array;
  perm: Int32Array;
  /** Vorzeichen der Permutation (für die Determinante) */
  sign: number;
  /** false: Matrix singulär */
  ok: boolean;
}

export function luFactor(A: CMatrix): LU {
  const n = A.n;
  const re = Float64Array.from(A.re);
  const im = Float64Array.from(A.im);
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  let sign = 1;
  let ok = true;
  let scale = 0;
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.hypot(re[i]!, im[i]!));
  const tiny = (scale || 1) * 1e-30;
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = -1;
    for (let r = k; r < n; r++) {
      const m = Math.hypot(re[r * n + k]!, im[r * n + k]!);
      if (m > best) { best = m; p = r; }
    }
    if (best <= tiny) { ok = false; continue; }
    if (p !== k) {
      for (let c = 0; c < n; c++) {
        const a = k * n + c, b = p * n + c;
        [re[a], re[b]] = [re[b]!, re[a]!];
        [im[a], im[b]] = [im[b]!, im[a]!];
      }
      [perm[k], perm[p]] = [perm[p]!, perm[k]!];
      sign = -sign;
    }
    const pr = re[k * n + k]!, pi = im[k * n + k]!;
    const d = pr * pr + pi * pi;
    for (let r = k + 1; r < n; r++) {
      const ar = re[r * n + k]!, ai = im[r * n + k]!;
      if (ar === 0 && ai === 0) continue;
      // Faktor = a / pivot
      const fr = (ar * pr + ai * pi) / d;
      const fi = (ai * pr - ar * pi) / d;
      re[r * n + k] = fr;
      im[r * n + k] = fi;
      for (let c = k + 1; c < n; c++) {
        const br = re[k * n + c]!, bi = im[k * n + c]!;
        if (br === 0 && bi === 0) continue;
        re[r * n + c]! -= fr * br - fi * bi;
        im[r * n + c]! -= fr * bi + fi * br;
      }
    }
  }
  return { n, re, im, perm, sign, ok };
}

/** Löst A·x = b mit der Zerlegung; b und Ergebnis als getrennte Real- und Imaginärteile */
export function luSolve(lu: LU, bRe: Float64Array, bIm: Float64Array): { re: Float64Array; im: Float64Array } {
  const { n, re, im, perm } = lu;
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  for (let i = 0; i < n; i++) { xr[i] = bRe[perm[i]!]!; xi[i] = bIm[perm[i]!]!; }
  for (let i = 0; i < n; i++) {
    let sr = xr[i]!, si = xi[i]!;
    for (let c = 0; c < i; c++) {
      const lr = re[i * n + c]!, li = im[i * n + c]!;
      sr -= lr * xr[c]! - li * xi[c]!;
      si -= lr * xi[c]! + li * xr[c]!;
    }
    xr[i] = sr; xi[i] = si;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = xr[i]!, si = xi[i]!;
    for (let c = i + 1; c < n; c++) {
      const ur = re[i * n + c]!, ui = im[i * n + c]!;
      sr -= ur * xr[c]! - ui * xi[c]!;
      si -= ur * xi[c]! + ui * xr[c]!;
    }
    const pr = re[i * n + i]!, pi = im[i * n + i]!;
    const d = pr * pr + pi * pi || 1e-300;
    xr[i] = (sr * pr + si * pi) / d;
    xi[i] = (si * pr - sr * pi) / d;
  }
  return { re: xr, im: xi };
}

/** Determinante (Realteil genügt für reelle Matrizen) */
export function luDet(lu: LU): { re: number; im: number } {
  let dr = lu.sign, di = 0;
  for (let i = 0; i < lu.n; i++) {
    const pr = lu.re[i * lu.n + i]!, pi = lu.im[i * lu.n + i]!;
    [dr, di] = [dr * pr - di * pi, dr * pi + di * pr];
  }
  return { re: dr, im: di };
}
