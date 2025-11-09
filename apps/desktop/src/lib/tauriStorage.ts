import { Store } from '@tauri-apps/plugin-store';
import type { StateStorage } from 'zustand/middleware';

export class TauriStorage implements StateStorage {
  private storePromise: Promise<Store>;
  private storeName: string;

  constructor(storeName: string = 'settings.json') {
    this.storeName = storeName;
    this.storePromise = this.initializeStore();
  }

  private async initializeStore(): Promise<Store> {
    try {
      return await Store.load(this.storeName);
    } catch (error) {
      console.error(`Failed to load Tauri store "${this.storeName}":`, error);

      try {
        console.warn(`Attempting to recover corrupted store "${this.storeName}"...`);
        const store = await Store.load(this.storeName);
        await store.clear();
        await store.save();
        console.info(`Successfully recovered store "${this.storeName}"`);
        return store;
      } catch (recoveryError) {
        console.error(`Failed to recover store "${this.storeName}":`, recoveryError);
        return await Store.load(this.storeName);
      }
    }
  }

  async getItem(name: string): Promise<string | null> {
    try {
      const store = await this.storePromise;
      const value = await store.get<string>(name);
      return value ?? null;
    } catch (error) {
      console.error(`Failed to get item "${name}" from Tauri store:`, error);

      try {
        console.warn(`Attempting to recover store for getItem("${name}")...`);
        this.storePromise = this.initializeStore();
        const newStore = await this.storePromise;
        const value = await newStore.get<string>(name);
        return value ?? null;
      } catch (recoveryError) {
        console.error(`Recovery failed for getItem("${name}"):`, recoveryError);
        return null;
      }
    }
  }

  async setItem(name: string, value: string): Promise<void> {
    try {
      const store = await this.storePromise;
      await store.set(name, value);
      await store.save();
    } catch (error) {
      console.error(`Failed to set item "${name}" in Tauri store:`, error);

      try {
        console.warn(`Attempting to recover store for setItem("${name}")...`);
        this.storePromise = this.initializeStore();
        const newStore = await this.storePromise;
        await newStore.set(name, value);
        await newStore.save();
        console.info(`Successfully recovered and saved item "${name}"`);
      } catch (recoveryError) {
        console.error(`Recovery failed for setItem("${name}"):`, recoveryError);
        throw recoveryError;
      }
    }
  }

  async removeItem(name: string): Promise<void> {
    try {
      const store = await this.storePromise;
      await store.delete(name);
      await store.save();
    } catch (error) {
      console.error(`Failed to remove item "${name}" from Tauri store:`, error);

      try {
        console.warn(`Attempting to recover store for removeItem("${name}")...`);
        this.storePromise = this.initializeStore();
        const newStore = await this.storePromise;
        await newStore.delete(name);
        await newStore.save();
        console.info(`Successfully recovered and removed item "${name}"`);
      } catch (recoveryError) {
        console.error(`Recovery failed for removeItem("${name}"):`, recoveryError);
        throw recoveryError;
      }
    }
  }

  async clear(): Promise<void> {
    try {
      const store = await this.storePromise;
      await store.clear();
      await store.save();
    } catch (error) {
      console.error('Failed to clear Tauri store:', error);
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    try {
      const store = await this.storePromise;
      return await store.keys();
    } catch (error) {
      console.error('Failed to get keys from Tauri store:', error);
      return [];
    }
  }

  async length(): Promise<number> {
    try {
      const store = await this.storePromise;
      return await store.length();
    } catch (error) {
      console.error('Failed to get store length:', error);
      return 0;
    }
  }
}

export const createTauriStorage = (storeName?: string): StateStorage => {
  return new TauriStorage(storeName);
};

export const createStorageAdapter = (storeName: string = 'settings.json'): StateStorage => {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return createTauriStorage(storeName);
  }

  console.warn('Tauri not detected, falling back to localStorage');
  return {
    getItem: (name: string) => {
      const value = localStorage.getItem(name);
      return Promise.resolve(value);
    },
    setItem: (name: string, value: string) => {
      localStorage.setItem(name, value);
      return Promise.resolve();
    },
    removeItem: (name: string) => {
      localStorage.removeItem(name);
      return Promise.resolve();
    },
  };
};
