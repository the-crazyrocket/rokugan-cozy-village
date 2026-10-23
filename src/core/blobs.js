// Blob store interface: binary data by id, kept out of the save (photos live here, the save keeps only their ids).
// Every method returns a promise so the IndexedDB implementation (ui/idb-blobs.js, browser only) can match it.
//
//   put(id, data, meta = {}) -> void       data: Blob | ArrayBuffer | Uint8Array | string; replaces any blob with that id
//   get(id) -> { id, data, meta, size, at } | null
//   has(id) -> bool
//   delete(id) -> bool                      true when something was removed
//   list() -> [{ id, meta, size, at }]      oldest first, ties by id
//
// A missing blob is `null`, never an error: callers draw a placeholder.

const sizeOf = (d) => d?.size ?? d?.byteLength ?? d?.length ?? 0;

export const BLOB_METHODS = Object.freeze(['put', 'get', 'has', 'delete', 'list']);

export function assertBlobStore(store) {
  for (const m of BLOB_METHODS) if (typeof store?.[m] !== 'function') throw new Error(`blob store is missing ${m}()`);
  return store;
}

export function createMemoryBlobs({ now = () => 0 } = {}) {
  const map = new Map();
  return {
    kind: 'memory',
    async put(id, data, meta = {}) {
      if (typeof id !== 'string' || !id) throw new Error('a blob needs an id');
      map.set(id, { id, data, meta: { ...meta }, size: sizeOf(data), at: now() });
    },
    async get(id) {
      const b = map.get(id);
      return b ? { ...b, meta: { ...b.meta } } : null;
    },
    async has(id) { return map.has(id); },
    async delete(id) { return map.delete(id); },
    async list() {
      return [...map.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)).map(({ id, meta, size, at }) => ({ id, meta: { ...meta }, size, at }));
    },
  };
}
