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
  const reconnectDelay = 3000;

  const connect = async () => {
    try {
      setConnectionStatus('connecting');
      console.log('Starting WebSocket connection...');
      
     
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

     
      if (wsRef.current) {
        console.log('Closing existing WebSocket connection');
        wsRef.current.close();
      }

      console.log('Creating new WebSocket connection...');
      wsRef.current = new WebSocket(wsUrl);

     
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CONNECTING) {
          console.warn('Timeout connessione WebSocket');
          wsRef.current?.close();
          setConnectionStatus('error');
        }
      }, 10000);

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
       
        const errorDetails = {
          type: error.type,
          target: error.target ? {
            readyState: (error.target as any).readyState,
            url: (error.target as any).url
          } : 'unknown'
        };
        
       
       
        if (error.type && error.type !== 'error') {
          console.error('❌ Specific WebSocket error:', errorDetails);
        } else if (wsRef.current?.readyState === WebSocket.CLOSED || wsRef.current?.readyState === WebSocket.CLOSING) {
         
          console.error('❌ WebSocket error (connection closed):', errorDetails);
        } else {
         
          console.debug('🔧 WebSocket event (normal):', errorDetails);
        }
        
       
        if (wsRef.current?.readyState === WebSocket.CLOSED || wsRef.current?.readyState === WebSocket.CLOSING) {
          setConnectionStatus('error');
        }
        
       
        if (error.type && error.type !== 'error') {
          options.onError?.(error);
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
         
          if (!event.data || event.data.trim() === '') {
            console.debug('Empty WebSocket message received');
            return;
          }

          const notification: WebSocketNotification = JSON.parse(event.data);
          console.log('📨 WebSocket notification received:', notification);
          
         
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
   
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
   
    if (wsRef.current) {
     
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

   
    const pingInterval = setInterval(() => {
      if (isConnected) {
        sendPing();
      }
    }, 30000);

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
