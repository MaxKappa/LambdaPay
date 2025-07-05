import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const TABLE = process.env.TRANSACTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const claims = event.requestContext.authorizer?.claims || event.requestContext.authorizer;
  const userId = claims?.sub;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'User ID non fornito' }),
    };
  }
  try {
    const { Items } = await db.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ConsistentRead: true
    }));
    return {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      statusCode: 200,
      body: JSON.stringify(Items),
    };
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Errore nel recupero delle transazioni' }),
    };
  }
};
