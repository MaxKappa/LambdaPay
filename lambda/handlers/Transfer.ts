import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, TransactWriteItemsCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const BALANCE_TABLE = process.env.BALANCE_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const { amount, recipientId } = JSON.parse(event.body!);
  const senderId = event.requestContext.authorizer?.claims.sub!;

  if (!amount || !recipientId || !senderId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti' }),
    };
  }

  // Controlla saldo mittente
  const senderBalanceRes = await db.send(new GetItemCommand({
    TableName: BALANCE_TABLE,
    Key: { userId: { S: senderId } }
  }));
  const senderBalance = parseFloat(senderBalanceRes.Item?.balance?.N ?? '0');
  if (senderBalance < amount) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Saldo insufficiente' }),
    };
  }

  const now = new Date().toISOString();
  const transactionId = uuidv4();

  try {
    await db.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: senderId } },
            UpdateExpression: 'SET balance = balance - :amt',
            ExpressionAttributeValues: { ':amt': { N: amount.toString() } },
            ConditionExpression: 'balance >= :amt'
          }
        },
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: recipientId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { ':amt': { N: amount.toString() }, ':zero': { N: '0' } }
          }
        },
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: senderId },
              transactionId: { S: transactionId },
              amount: { N: (-amount).toString() },
              date: { S: now },
              to: { S: recipientId }
            }
          }
        },
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: recipientId },
              transactionId: { S: transactionId },
              amount: { N: amount.toString() },
              date: { S: now },
              from: { S: senderId }
            }
          }
        }
      ]
    }));
    return { headers: { 'Access-Control-Allow-Origin': '*' }, statusCode: 200, body: JSON.stringify({ message: 'Transfer completed' }) };
  } catch (err: any) {
    console.error(err);
    return { headers: { 'Access-Control-Allow-Origin': '*' }, statusCode: 500, body: JSON.stringify({ message: 'Errore nel trasferimento' }) };
  }
};
