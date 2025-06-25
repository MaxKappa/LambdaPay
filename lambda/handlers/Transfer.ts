import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: process.env.AWS_REGION });
const TABLE = process.env.TRANSACTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const { amount, recipientId } = JSON.parse(event.body!);
  const senderId = event.requestContext.authorizer?.claims.sub!;

  try {
    await db.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { userId: { S: senderId } },
            UpdateExpression: 'SET balance = balance - :amt',
            ExpressionAttributeValues: { ':amt': { N: amount.toString() } }
          }
        },
        {
          Update: {
            TableName: TABLE,
            Key: { userId: { S: recipientId } },
            UpdateExpression: 'SET balance = balance + :amt',
            ExpressionAttributeValues: { ':amt': { N: amount.toString() } }
          }
        }
      ]
    }));
    return { headers:{'Access-Control-Allow-Origin': '*'},statusCode: 200, body: JSON.stringify({ message: 'Transfer completed' }) };
  } catch (err: any) {
    console.error(err);
    return { headers:{'Access-Control-Allow-Origin': '*'},statusCode: 500, body: JSON.stringify({ message: 'Errore nel trasferimento' }) };
  }
};
