/** Flat run-length coding of a byte array: [value, run, value, run, ...]. */
export function rleEncode(a) {
  const out = [];
  for (let i = 0; i < a.length;) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

/** Inverse of rleEncode; throws unless the runs cover exactly `length` bytes. */
export function rleDecode(pairs, length) {
  if (!Array.isArray(pairs) || pairs.length % 2) throw new Error('bad RLE data');
  const out = new Uint8Array(length);
  let k = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    const v = pairs[i], n = pairs[i + 1];
    if (!Number.isInteger(v) || v < 0 || v > 255 || !Number.isInteger(n) || n < 1 || k + n > length) throw new Error('bad RLE data');
    out.fill(v, k, k + n);
    k += n;
  }
  if (k !== length) throw new Error('bad RLE data');
  return out;
}
