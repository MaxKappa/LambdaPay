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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
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

      // Timeout per la connessione
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CONNECTING) {
          console.warn('Timeout connessione WebSocket');
          wsRef.current?.close();
          setConnectionStatus('error');
        }
      }, 10000); // 10 secondi timeout

      wsRef.current.onopen = () => {
        clearTimeout(connectionTimeout);
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
        // Verifica se è un errore significativo
        const errorDetails = {
          type: error.type,
          target: error.target ? {
            readyState: (error.target as any).readyState,
            url: (error.target as any).url
          } : 'unknown'
        };
        
        // Solo logga errori significativi, non eventi generici "error"
        // che vengono generati normalmente durante le connessioni WebSocket
        if (error.type && error.type !== 'error') {
          console.error('❌ Errore WebSocket specifico:', errorDetails);
        } else if (wsRef.current?.readyState === WebSocket.CLOSED || wsRef.current?.readyState === WebSocket.CLOSING) {
          // Logga solo se la connessione è realmente chiusa/in chiusura
          console.error('❌ Errore WebSocket (connessione chiusa):', errorDetails);
        } else {
          // Eventi normali durante la connessione - non loggare come errori
          console.debug('🔧 Evento WebSocket (normale):', errorDetails);
        }
        
        // Solo imposta stato di errore se è un errore reale
        if (wsRef.current?.readyState === WebSocket.CLOSED || wsRef.current?.readyState === WebSocket.CLOSING) {
          setConnectionStatus('error');
        }
        
        // Solo chiama onError per errori significativi
        if (error.type && error.type !== 'error') {
          options.onError?.(error);
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          // Verifica che il messaggio non sia vuoto
          if (!event.data || event.data.trim() === '') {
            console.debug('Messaggio WebSocket vuoto ricevuto');
            return;
          }

          const notification: WebSocketNotification = JSON.parse(event.data);
          console.log('📨 Notifica WebSocket ricevuta:', notification);
          
          // Verifica che la notifica abbia i campi richiesti
          if (!notification.type || !notification.timestamp) {
            console.warn('Notifica WebSocket malformata:', notification);
            return;
          }
          
          options.onNotification?.(notification);
        } catch (error) {
          console.error('❌ Errore nel parsing del messaggio WebSocket:', {
            error: error instanceof Error ? error.message : 'Errore sconosciuto',
            rawData: event.data
          });
        }
      };

    } catch (error) {
      console.error('❌ Errore durante la connessione WebSocket:', error);
      setConnectionStatus('error');
    }
  };

  const disconnect = () => {
    // Cleanup timeout di riconnessione
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
    // Chiudi connessione WebSocket
    if (wsRef.current) {
      // Rimuovi i listener per evitare eventi durante la chiusura
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close(1000, 'Disconnessione volontaria');
      }
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
