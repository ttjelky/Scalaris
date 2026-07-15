/**
 * Легкий менеджер WebSocket-з'єднання з авто-перепідключенням (exponential backoff).
 * Це базова інфраструктура для всього live-функціоналу платформи —
 * зараз карта, потім сюди ж ляжуть live-чат і нотифікації.
 */

const WS_BASE_URL =
  import.meta.env?.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const OFFLINE_AFTER_ATTEMPTS = 4; // після стількох невдалих спроб показуємо "offline" в UI

/**
 * @param {string} path — шлях сокета, напр. '/ws/location/'
 * @param {{
 *   onOpen?: () => void,
 *   onMessage?: (data: any) => void,
 *   onStatusChange?: (status: 'connecting'|'live'|'reconnecting'|'offline') => void
 * }} handlers
 * @returns {{ send: (data: object) => boolean, close: () => void }}
 */
export function createSocket(path, { onOpen, onMessage, onStatusChange } = {}) {
  let ws = null;
  let attempt = 0;
  let reconnectTimer = null;
  let closedByClient = false;

  const setStatus = (status) => onStatusChange?.(status);

  const scheduleReconnect = () => {
    attempt += 1;
    setStatus(attempt > OFFLINE_AFTER_ATTEMPTS ? 'offline' : 'reconnecting');
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect() {
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    ws = new WebSocket(`${WS_BASE_URL}${path}`);

    ws.onopen = () => {
      attempt = 0;
      setStatus('live');
      onOpen?.();
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // ігноруємо повідомлення, які не парсяться як JSON
      }
      onMessage?.(data);
    };

    ws.onclose = () => {
      if (!closedByClient) scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return {
    /** Повертає true, якщо повідомлення реально пішло (сокет відкритий). */
    send(data) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        return true;
      }
      return false;
    },
    close() {
      closedByClient = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}