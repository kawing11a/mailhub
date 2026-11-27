const form = document.querySelector('#connection-form');
const input = document.querySelector('#server-url');
const button = document.querySelector('#connect-button');
const status = document.querySelector('#status');
const invoke = window.__TAURI__?.core?.invoke;
const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}

async function loadSavedConnection() {
  try {
    const serverUrl = await invoke('get_server_connection');
    if (serverUrl) input.value = serverUrl;
  } catch (error) {
    setStatus(String(error), true);
  }
}

if (!invoke || !currentWindow) {
  button.disabled = true;
  setStatus('Open this page in the MailHub Desktop app to connect a server.', true);
} else {
  loadSavedConnection();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    button.disabled = false;
    setStatus('');
    loadSavedConnection();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    setStatus('Opening MailHub…');

    try {
      await invoke('connect_to_server', { serverUrl: input.value });
      button.disabled = false;
      setStatus('MailHub opened in a separate window.');
      await currentWindow.hide();
    } catch (error) {
      setStatus(String(error), true);
      button.disabled = false;
    }
  });
}
