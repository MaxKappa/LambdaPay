import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, DeleteItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('WebSocket Disconnect Event:', JSON.stringify(event, null, 2));
  
  const connectionId = event.requestContext.connectionId!;
  
  console.log(`WebSocket disconnect attempt - ConnectionId: ${connectionId}`);

  try {
   
    await db.send(new DeleteItemCommand({
      TableName: CONNECTIONS_TABLE,
      Key: {
        connectionId: { S: connectionId }
      }
    }));

    console.log(`WebSocket connection closed successfully: ${connectionId}`);
    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('Error during WebSocket disconnection:', error);
   
    return { statusCode: 200, body: 'Disconnected' };
  }
};
