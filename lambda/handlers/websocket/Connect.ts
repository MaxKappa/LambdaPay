import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('WebSocket Connect Event:', JSON.stringify(event, null, 2));
  
  const connectionId = event.requestContext.connectionId!;
  const userId = event.queryStringParameters?.userId;

  console.log(`Tentativo di connessione WebSocket - ConnectionId: ${connectionId}, UserId: ${userId}`);

  if (!userId) {
    console.error('UserId mancante nella connessione WebSocket');
    return { statusCode: 400, body: 'UserId richiesto' };
  }

  try {
    // Salva la connessione nel database
    await db.send(new PutItemCommand({
      TableName: CONNECTIONS_TABLE,
      Item: {
        connectionId: { S: connectionId },
        userId: { S: userId },
        connectedAt: { S: new Date().toISOString() },
        // Aggiungi TTL (24 ore da ora)
        ttl: { N: Math.floor(Date.now() / 1000 + 24 * 60 * 60).toString() }
      }
    }));

    console.log(`Connessione WebSocket stabilita con successo: ${connectionId} per utente: ${userId}`);
    return { statusCode: 200, body: 'Connesso' };
  } catch (error) {
    console.error('Errore durante la connessione WebSocket:', error);
    return { statusCode: 500, body: 'Errore di connessione' };
  }
};
