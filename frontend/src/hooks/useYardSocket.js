import { useEffect, useRef, useState } from 'react';

export function useYardSocket(yardId) {
  const [messages, setMessages] = useState([]);
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:8000/ws/yard/${yardId}/`);
    ws.current.onmessage = (e) => {
      setMessages(prev => [...prev, JSON.parse(e.data)]);
    };
    return () => ws.current?.close();
  }, [yardId]);

  const send = (data) => ws.current?.send(JSON.stringify(data));
  return { messages, send };
}