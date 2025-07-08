import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, DeleteItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('WebSocket Disconnect Event:', JSON.stringify(event, null, 2));
  
  const connectionId = event.requestContext.connectionId!;
  
  console.log(`Tentativo di disconnessione WebSocket - ConnectionId: ${connectionId}`);

  try {
    // Rimuovi la connessione dal database
    await db.send(new DeleteItemCommand({
      TableName: CONNECTIONS_TABLE,
      Key: {
        connectionId: { S: connectionId }
      }
    }));

    console.log(`Connessione WebSocket chiusa con successo: ${connectionId}`);
    return { statusCode: 200, body: 'Disconnesso' };
  } catch (error) {
    console.error('Errore durante la disconnessione WebSocket:', error);
    // Non restituire errore per la disconnessione per evitare loop
    return { statusCode: 200, body: 'Disconnesso' };
  }
};
