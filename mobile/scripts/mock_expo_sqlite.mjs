import { mock } from 'node:test';

mock.module('expo-sqlite', {
  exports: {
    openDatabaseAsync: async () => ({
      execAsync: async () => {},
      runAsync: async () => ({ lastInsertRowId: 1, changes: 1 }),
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      withTransactionAsync: async (cb) => cb(),
    }),
  },
});

mock.module('expo-secure-store', {
  exports: {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  },
});

mock.module('expo-pdf-page-renderer', {
  exports: {
    cleanupPdfPageImage: async (uri) => {
      try {
        const fs = await import('node:fs');
        const clean = String(uri).replace(/^file:\/\//, '');
        if (fs.existsSync(clean)) {
          fs.unlinkSync(clean);
        }
      } catch {}
      return true;
    },
    sanitizeTemporaryFiles: async () => ({ removedCount: 0 }),
    renderPdfPageToImage: async () => '',
  },
});

