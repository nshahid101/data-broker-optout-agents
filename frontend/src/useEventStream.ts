import { useEffect, useRef, useState } from "react";
import { EVENTS_URL } from "./api";
import type { QueueEvent } from "./types";

/** Subscribes to the backend's SSE event queue and keeps a rolling log. */
export function useEventStream(onEvent: (event: QueueEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource(EVENTS_URL);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      const event: QueueEvent = JSON.parse(message.data);
      onEventRef.current(event);
    };
    return () => source.close();
  }, []);

  return { connected };
}
