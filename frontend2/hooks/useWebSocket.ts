import { useEffect, useRef, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

export interface WebSocketNotification {
  type: 'TRANSACTION' | 'REQUEST' | 'BALANCE_UPDATE';
  data: any;
  timestamp: string;
}

export interface UseWebSocketOptions {
  onNotification?: (notification: WebSocketNotification) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 secondi

  const connect = async () => {
    try {
      setConnectionStatus('connecting');
      console.log('Iniziando connessione WebSocket...');
      
      // Ottieni le informazioni dell'utente autenticato
      const session = await fetchAuthSession();
      const userId = session.tokens?.idToken?.payload?.sub;
      
      if (!userId) {
        console.error('UserId non disponibile per la connessione WebSocket');
        setConnectionStatus('error');
        return;
      }

      const wsUrl = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}?userId=${userId}`;
      console.log('Connessione WebSocket a:', wsUrl);
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket già connesso');
        return;
      }

      // Chiudi connessione esistente se presente
      if (wsRef.current) {
        console.log('Chiudendo connessione WebSocket esistente');
        wsRef.current.close();
      }

      console.log('Creando nuova connessione WebSocket...');
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connesso con successo');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        options.onConnect?.();
      };

      wsRef.current.onclose = (event) => {
        console.log('❌ WebSocket disconnesso:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        setIsConnected(false);
        setConnectionStatus('disconnected');
        options.onDisconnect?.();

        // Tentativi di riconnessione automatica solo se non è una disconnessione pulita
        if (reconnectAttempts.current < maxReconnectAttempts && !event.wasClean) {
          reconnectAttempts.current++;
          console.log(`🔄 Tentativo di riconnessione ${reconnectAttempts.current}/${maxReconnectAttempts} in ${reconnectDelay/1000}s`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else if (event.wasClean) {
          console.log('Disconnessione volontaria, non riconnetterò automaticamente');
        } else {
          console.log('Raggiunti i tentativi massimi di riconnessione');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ Errore WebSocket:', {
          type: error.type,
          target: error.target ? {
            readyState: (error.target as any).readyState,
            url: (error.target as any).url
          } : 'unknown'
        });
        setConnectionStatus('error');
        options.onError?.(error);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const notification: WebSocketNotification = JSON.parse(event.data);
          console.log('📨 Notifica WebSocket ricevuta:', notification);
          options.onNotification?.(notification);
        } catch (error) {
          console.error('❌ Errore nel parsing del messaggio WebSocket:', error);
        }
      };

    } catch (error) {
      console.error('❌ Errore durante la connessione WebSocket:', error);
      setConnectionStatus('error');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Disconnessione volontaria');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    reconnectAttempts.current = 0;
  };

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket non connesso, impossibile inviare messaggio');
    }
  };

  const sendPing = () => {
    sendMessage({ action: 'ping' });
  };

  useEffect(() => {
    connect();

    // Ping periodico per mantenere la connessione attiva
    const pingInterval = setInterval(() => {
      if (isConnected) {
        sendPing();
      }
    }, 30000); // 30 secondi

    return () => {
      clearInterval(pingInterval);
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    sendMessage,
    sendPing
  };
}
