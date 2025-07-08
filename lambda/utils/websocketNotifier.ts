import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

interface NotificationPayload {
  type: 'TRANSACTION' | 'REQUEST' | 'BALANCE_UPDATE';
  data: any;
  timestamp: string;
}

export class WebSocketNotifier {
  private apiGw: ApiGatewayManagementApiClient;

  constructor(endpoint: string) {
    this.apiGw = new ApiGatewayManagementApiClient({
      endpoint,
      region: process.env.AWS_REGION || 'eu-west-1'
    });
  }

  /**
   * Invia una notifica a un utente specifico
   */
  async notifyUser(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      console.log(`Inviando notifica a utente ${userId}:`, JSON.stringify(payload));
      
      // Trova tutte le connessioni dell'utente
      const connections = await this.getUserConnections(userId);
      
      if (connections.length === 0) {
        console.log(`Nessuna connessione WebSocket attiva per l'utente ${userId}`);
        return;
      }

      console.log(`Trovate ${connections.length} connessioni per l'utente ${userId}:`, connections);

      // Invia la notifica a tutte le connessioni dell'utente
      const promises = connections.map(connectionId => 
        this.sendToConnection(connectionId, payload)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Notifiche inviate - Successo: ${successful}, Fallimento: ${failed}`);
    } catch (error) {
      console.error(`Errore nell'invio della notifica all'utente ${userId}:`, error);
    }
  }

  /**
   * Trova tutte le connessioni WebSocket di un utente
   */
  private async getUserConnections(userId: string): Promise<string[]> {
    try {
      const result = await db.send(new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId }
        }
      }));

      return result.Items?.map(item => item.connectionId.S!) || [];
    } catch (error) {
      console.error(`Errore nel recuperare le connessioni per l'utente ${userId}:`, error);
      return [];
    }
  }

  /**
   * Invia un messaggio a una specifica connessione WebSocket
   */
  private async sendToConnection(connectionId: string, payload: NotificationPayload): Promise<void> {
    try {
      console.log(`Tentativo di invio notifica alla connessione ${connectionId}:`, JSON.stringify(payload));
      
      await this.apiGw.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload)
      }));

      console.log(`Notifica inviata con successo alla connessione ${connectionId}`);
    } catch (error: any) {
      console.error(`Errore nell'invio alla connessione ${connectionId}:`, {
        error: error.message,
        statusCode: error.statusCode || error.$metadata?.httpStatusCode,
        code: error.code || error.name,
        metadata: error.$metadata
      });
      
      // Se la connessione è stale (410) o proibita (403), rimuovila dal database
      const statusCode = error.statusCode || error.$metadata?.httpStatusCode;
      if (statusCode === 410 || statusCode === 403 || error.name === 'GoneException' || error.name === 'ForbiddenException') {
        console.log(`Connessione ${connectionId} non più valida (status: ${statusCode}), rimuovendola...`);
        await this.removeStaleConnection(connectionId);
      }
      
      // Re-throw per permettere la gestione a livello superiore
      throw error;
    }
  }

  /**
   * Rimuove una connessione non più valida dal database
   */
  private async removeStaleConnection(connectionId: string): Promise<void> {
    try {
      await db.send(new DeleteItemCommand({
        TableName: CONNECTIONS_TABLE,
        Key: {
          connectionId: { S: connectionId }
        }
      }));
      console.log(`Connessione stale rimossa: ${connectionId}`);
    } catch (error) {
      console.error(`Errore nella rimozione della connessione stale ${connectionId}:`, error);
    }
  }
}

/**
 * Factory function per creare un notifier WebSocket
 */
export function createWebSocketNotifier(): WebSocketNotifier {
  const stage = process.env.STAGE || 'dev';
  const region = process.env.AWS_REGION || 'eu-west-1';
  const apiId = process.env.WEBSOCKET_API_ID;
  
  console.log('Environment variables:', {
    STAGE: process.env.STAGE,
    AWS_REGION: process.env.AWS_REGION,
    WEBSOCKET_API_ID: process.env.WEBSOCKET_API_ID
  });
  
  if (!apiId) {
    console.error('WEBSOCKET_API_ID environment variable is missing');
    throw new Error('WEBSOCKET_API_ID environment variable is required');
  }
  
  // Endpoint per ApiGatewayManagementApi (diverso dal WebSocket endpoint)
  const endpoint = `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`;
  console.log(`Creando WebSocket notifier con endpoint: ${endpoint}`);
  return new WebSocketNotifier(endpoint);
}
