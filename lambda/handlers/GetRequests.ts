import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const REQUESTS_TABLE = process.env.REQUESTS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const claims = event.requestContext.authorizer?.claims || event.requestContext.authorizer;
  const userId = claims?.sub;
  const type = event.queryStringParameters?.type || 'received'; // 'received' or 'sent'
  
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'User ID not provided' }),
    };
  }

  try {
    let queryParams;
    
    if (type === 'sent') {
      // Richieste inviate dall'utente corrente
      queryParams = {
        TableName: REQUESTS_TABLE,
        IndexName: 'FromUserIndex',
        KeyConditionExpression: 'fromUserId = :userId',
        ExpressionAttributeValues: { ':userId': { S: userId } }
      };
    } else {
      // Richieste ricevute dall'utente corrente (default)
      queryParams = {
        TableName: REQUESTS_TABLE,
        IndexName: 'ToUserIndex',
        KeyConditionExpression: 'toUserId = :userId',
        ExpressionAttributeValues: { ':userId': { S: userId } }
      };
    }

    const { Items } = await db.send(new QueryCommand(queryParams));

    return {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      statusCode: 200,
      body: JSON.stringify(Items || []),
    };
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error retrieving requests' }),
    };
  }
};
