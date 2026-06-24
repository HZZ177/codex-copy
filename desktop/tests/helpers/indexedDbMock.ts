import { vi } from "vitest";

type StoreMap = Map<string, unknown>;

interface MockRequest<T = unknown> {
  result?: T;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

export function installIndexedDbMock() {
  const stores = new Map<string, StoreMap>();

  const indexedDb = {
    open(_name: string, _version?: number) {
      const request = createRequest<IDBDatabase>();
      const db = createDb(stores);
      request.result = db;
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
    deleteDatabase(_name: string) {
      stores.clear();
      const request = createRequest();
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };

  vi.stubGlobal("indexedDB", indexedDb);
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: indexedDb,
  });
}

function createRequest<T = unknown>(): MockRequest<T> {
  return {
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
}

function createDb(stores: Map<string, StoreMap>): IDBDatabase {
  return {
    objectStoreNames: {
      contains(name: string) {
        return stores.has(name);
      },
    },
    createObjectStore(name: string) {
      stores.set(name, stores.get(name) ?? new Map());
      return {};
    },
    transaction(name: string) {
      const store = stores.get(name) ?? new Map();
      stores.set(name, store);
      const transaction = {
        error: null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        objectStore() {
          return {
            get(key: string) {
              const request = createRequest();
              request.result = store.get(key);
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
            put(value: unknown, key: string) {
              store.set(key, value);
              const request = createRequest();
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
          };
        },
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
    close() {
      return undefined;
    },
  } as unknown as IDBDatabase;
}
