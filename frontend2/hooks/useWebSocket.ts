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
      console.log('Starting WebSocket connection...');
      
      // Get authenticated user information
      const session = await fetchAuthSession();
      const userId = session.tokens?.idToken?.payload?.sub;
      
      if (!userId) {
        console.error('UserId not available for WebSocket connection');
        setConnectionStatus('error');
        return;
      }

      const wsUrl = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}?userId=${userId}`;
      console.log('WebSocket connection to:', wsUrl);
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        return;
      }

      // Close existing connection if present
      if (wsRef.current) {
        console.log('Closing existing WebSocket connection');
        wsRef.current.close();
      }

      console.log('Creating new WebSocket connection...');
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
        console.log('✅ WebSocket connected successfully');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        options.onConnect?.();
      };

      wsRef.current.onclose = (event) => {
        console.log('❌ WebSocket disconnected:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        setIsConnected(false);
        setConnectionStatus('disconnected');
        options.onDisconnect?.();

        // Automatic reconnection attempts only if it's not a clean disconnection
        if (reconnectAttempts.current < maxReconnectAttempts && !event.wasClean) {
          reconnectAttempts.current++;
          console.log(`🔄 Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts} in ${reconnectDelay/1000}s`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else if (event.wasClean) {
          console.log('Voluntary disconnection, will not reconnect automatically');
        } else {
          console.log('Maximum reconnection attempts reached');
        }
      };

      wsRef.current.onerror = (error) => {
        // Check if it's a significant error
        const errorDetails = {
          type: error.type,
          target: error.target ? {
            readyState: (error.target as any).readyState,
            url: (error.target as any).url
          } : 'unknown'
        };
        
        // Only log significant errors, not generic "error" events
        // that are generated normally during WebSocket connections
        if (error.type && error.type !== 'error') {
          console.error('❌ Specific WebSocket error:', errorDetails);
        } else if (wsRef.current?.readyState === WebSocket.CLOSED || wsRef.current?.readyState === WebSocket.CLOSING) {
          // Log only if connection is actually closed/closing
          console.error('❌ WebSocket error (connection closed):', errorDetails);
        } else {
          // Normal events during connection - don't log as errors
          console.debug('🔧 WebSocket event (normal):', errorDetails);
        }
        
        // Only set error state if it's a real error
        if (wsRef.current?.readyState === WebSocket.CLOSED || wsRef.current?.readyState === WebSocket.CLOSING) {
          setConnectionStatus('error');
        }
        
        // Only call onError for significant errors
        if (error.type && error.type !== 'error') {
          options.onError?.(error);
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          // Check that the message is not empty
          if (!event.data || event.data.trim() === '') {
            console.debug('Empty WebSocket message received');
            return;
          }

          const notification: WebSocketNotification = JSON.parse(event.data);
          console.log('📨 WebSocket notification received:', notification);
          
          // Check that the notification has required fields
          if (!notification.type || !notification.timestamp) {
            console.warn('Malformed WebSocket notification:', notification);
            return;
          }
          
          options.onNotification?.(notification);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            rawData: event.data
          });
        }
      };

    } catch (error) {
      console.error('❌ Error during WebSocket connection:', error);
      setConnectionStatus('error');
    }
  };

  const disconnect = () => {
    // Cleanup reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
    // Close WebSocket connection
    if (wsRef.current) {
      // Remove listeners to avoid events during closure
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
