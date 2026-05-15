const DB_NAME = 'BackaSateriGolfDB';
const DB_VERSION = 1;

const STORE_ACTIVE = 'active_round';
const STORE_HISTORY = 'history';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject(event.target.error);

        request.onsuccess = (event) => resolve(event.target.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Store for active round (always using key 'current')
            if (!db.objectStoreNames.contains(STORE_ACTIVE)) {
                db.createObjectStore(STORE_ACTIVE, { keyPath: 'id' });
            }

            // Store for past rounds (auto-incrementing key)
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

const db = {
    async saveActiveRound(roundData) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_ACTIVE, 'readwrite');
            const store = transaction.objectStore(STORE_ACTIVE);
            
            // Always use the same ID so we overwrite the active round
            roundData.id = 'current';
            const request = store.put(roundData);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getActiveRound() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_ACTIVE, 'readonly');
            const store = transaction.objectStore(STORE_ACTIVE);
            const request = store.get('current');
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async clearActiveRound() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_ACTIVE, 'readwrite');
            const store = transaction.objectStore(STORE_ACTIVE);
            const request = store.delete('current');
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async saveHistory(roundData) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_HISTORY, 'readwrite');
            const store = transaction.objectStore(STORE_HISTORY);
            
            // Remove 'id' if it's 'current' so autoIncrement works
            delete roundData.id;
            roundData.completedAt = new Date().toISOString();
            
            const request = store.add(roundData);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getHistory() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_HISTORY, 'readonly');
            const store = transaction.objectStore(STORE_HISTORY);
            const request = store.getAll();
            
            request.onsuccess = () => {
                // Sort by newest first
                const data = request.result || [];
                data.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
                resolve(data);
            };
            request.onerror = () => reject(request.error);
        });
    }
};

window.GolfDB = db;
