import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const TABLE = process.env.BALANCE_TABLE!; 

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log("event.requestContext.authorizer:", JSON.stringify(event.requestContext.authorizer));
  const claims = event.requestContext.authorizer?.claims || event.requestContext.authorizer;
  const userId = claims?.sub;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        message: 'User ID non fornito',
        debug: event.requestContext.authorizer 
      }),
    };
  }
  try {
    const { Item } = await db.send(new GetItemCommand({
      TableName: TABLE,
      Key: { userId: { S: userId } }
    }));
    const balance = Item?.balance?.N ?? '0';
    return {
      headers: {
        'Access-Control-Allow-Origin': '*'
        },
      statusCode: 200,
      body: JSON.stringify({ balance }),
    };
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Errore nel recupero del saldo' }),
    };
  }
};
