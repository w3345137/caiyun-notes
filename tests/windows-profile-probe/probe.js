const result = document.getElementById('result');
const details = document.getElementById('details');
const marker = 'caiyun-windows-profile-probe-v1';

function show(status, message) {
  document.title = status;
  result.textContent = status;
  result.style.color = status === 'EXISTING_INDEXEDDB_READ_OK' ? '#047857' : '#b45309';
  details.textContent = `${message} | origin=${location.origin}`;
}

try {
  const request = indexedDB.open('caiyun-msix-profile-probe-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('checks');
  request.onerror = () => show('INDEXEDDB_OPEN_FAILED', request.error?.message || 'open failed');
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction('checks', 'readwrite');
    const store = transaction.objectStore('checks');
    const read = store.get('marker');
    read.onerror = () => show('INDEXEDDB_READ_FAILED', read.error?.message || 'read failed');
    read.onsuccess = () => {
      if (read.result === marker) {
        show('EXISTING_INDEXEDDB_READ_OK', 'The packaged process read the pre-package IndexedDB marker.');
      } else {
        store.put(marker, 'marker');
        transaction.oncomplete = () => show('NEW_INDEXEDDB_MARKER_CREATED', 'No prior marker was visible; one was created.');
      }
    };
    transaction.onerror = () => show('INDEXEDDB_TRANSACTION_FAILED', transaction.error?.message || 'transaction failed');
  };
} catch (error) {
  show('INDEXEDDB_EXCEPTION', String(error));
}
