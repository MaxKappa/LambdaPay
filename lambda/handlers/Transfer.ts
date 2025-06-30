import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, TransactWriteItemsCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const BALANCE_TABLE = process.env.BALANCE_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const { amount, recipientId } = JSON.parse(event.body!);
  const senderId = event.requestContext.authorizer?.claims.sub!;
  
  if (!amount || isNaN(Number(amount)) || !recipientId || !senderId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti o amount non valido' }),
    };
  }

  const numericAmount = Number(amount);

  // Controlla saldo mittente
  const senderBalanceRes = await db.send(new GetItemCommand({
    TableName: BALANCE_TABLE,
    Key: { userId: { S: senderId } }
  }));
  const senderBalance = parseFloat(senderBalanceRes.Item?.balance?.N ?? '0');
  if (senderBalance < numericAmount) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Saldo insufficiente' }),
    };
  }

  // Risolvi recipientId (email) in userId Cognito
  let resolvedRecipientId: string | undefined;
  let resolvedUsername: string | undefined;
  try {
    const usersRes = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${recipientId}"`,
      Limit: 1
    }));
    if (usersRes.Users && usersRes.Users.length > 0) {
      resolvedRecipientId = usersRes.Users[0].Attributes?.find(attr => attr.Name === "sub")?.Value;
      resolvedUsername = usersRes.Users[0].Attributes?.find(attr => attr.Name === "preferred_username")?.Value;
    }
  } catch (err) {
    console.error("Errore nella ricerca utente Cognito:", err);
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Errore nella ricerca utente destinatario' }),
    };
  }

  if (!resolvedRecipientId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 404,
      body: JSON.stringify({ message: 'Destinatario non trovato' }),
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
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) - :amt',
            ExpressionAttributeValues: { ':amt': { N: numericAmount.toString() }, ':zero': { N: '0' } },
            ConditionExpression: 'balance >= :amt'
          }
        },
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: resolvedRecipientId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { ':amt': { N: numericAmount.toString() }, ':zero': { N: '0' } }
          }
        },
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: senderId },
              transactionId: { S: transactionId },
              amount: { N: (-numericAmount).toString() },
              date: { S: now },
              to: { S: resolvedRecipientId },
              toEmail: { S: recipientId },
              toUsername: { S: resolvedUsername || ''}
            }
          }
        },
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: resolvedRecipientId },
              transactionId: { S: transactionId },
              amount: { N: numericAmount.toString() },
              date: { S: now },
              from: { S: senderId },
              fromEmail: { S: event.requestContext.authorizer?.claims.email || '' },
              fromUsername: { S: event.requestContext.authorizer?.claims.preferred_username || '' }
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
