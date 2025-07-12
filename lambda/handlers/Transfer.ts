import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, TransactWriteItemsCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { createWebSocketNotifier } from '../utils/websocketNotifier';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const BALANCE_TABLE = process.env.BALANCE_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
 
  if (!event.body) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body missing' }),
    };
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (error) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON format' }),
    };
  }

  const { amount, recipientId } = parsedBody;
  const senderId = event.requestContext.authorizer?.claims.sub;
  
 
  if (!amount || !recipientId || !senderId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing parameters: amount, recipientId and senderId are required' }),
    };
  }

 
  if (typeof amount !== 'number') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Amount must be an integer (cents)' }),
    };
  }

  const amountInCents = amount;

 
  if (!Number.isInteger(amountInCents) || !isFinite(amountInCents)) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Amount must be an integer (cents)' }),
    };
  }

 
  if (amountInCents <= 0) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Amount must be greater than zero' }),
    };
  }

 
  const MAX_TRANSFER_AMOUNT = 1000000;
  if (amountInCents > MAX_TRANSFER_AMOUNT) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: `Amount cannot exceed ${(MAX_TRANSFER_AMOUNT / 100).toLocaleString('en-US')} dollars` }),
    };
  }

 
  const senderEmail = event.requestContext.authorizer?.claims.email;
  if (recipientId === senderEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Cannot transfer money to yourself' }),
    };
  }

 
  const senderBalanceRes = await db.send(new GetItemCommand({
    TableName: BALANCE_TABLE,
    Key: { userId: { S: senderId } }
  }));
  const senderBalance = parseInt(senderBalanceRes.Item?.balance?.N ?? '0');
  if (senderBalance < amountInCents) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Insufficient balance' }),
    };
  }

 
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
    console.error("Error searching Cognito user:", err);
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Error searching recipient user' }),
    };
  }

  if (!resolvedRecipientId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 404,
      body: JSON.stringify({ message: 'Recipient not found' }),
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
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(amountInCents).toString() },
              ':zero': { N: '0' } 
            },
            ConditionExpression: 'balance >= :amt AND :amt > :zero'
          }
        },
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: resolvedRecipientId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(amountInCents).toString() },
              ':zero': { N: '0' } 
            },
            ConditionExpression: ':amt > :zero'
          }
        },
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: senderId },
              transactionId: { S: transactionId },
              amount: { N: (-Math.abs(amountInCents)).toString() },
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
              amount: { N: Math.abs(amountInCents).toString() },
              date: { S: now },
              from: { S: senderId },
              fromEmail: { S: event.requestContext.authorizer?.claims.email || '' },
              fromUsername: { S: event.requestContext.authorizer?.claims.preferred_username || '' }
            }
          }
        }
      ]
    }));
    
   
    try {
      const notifier = createWebSocketNotifier();
      const senderUsername = event.requestContext.authorizer?.claims.preferred_username || senderEmail?.split('@')[0] || 'User';
      
     
      await notifier.notifyUser(resolvedRecipientId, {
        type: 'TRANSACTION',
        data: {
          type: 'RECEIVED',
          amount: amountInCents,
          from: {
            id: senderId,
            email: senderEmail,
            username: senderUsername
          },
          transactionId,
          timestamp: now
        },
        timestamp: now
      });

     
      await notifier.notifyUser(senderId, {
        type: 'TRANSACTION',
        data: {
          type: 'SENT',
          amount: amountInCents,
          to: {
            id: resolvedRecipientId,
            email: recipientId,
            username: resolvedUsername
          },
          transactionId,
          timestamp: now
        },
        timestamp: now
      });

     
      const [updatedSenderBalance, updatedRecipientBalance] = await Promise.all([
        db.send(new GetItemCommand({
          TableName: BALANCE_TABLE,
          Key: { userId: { S: senderId } }
        })),
        db.send(new GetItemCommand({
          TableName: BALANCE_TABLE,
          Key: { userId: { S: resolvedRecipientId } }
        }))
      ]);

      await Promise.all([
        notifier.notifyUser(senderId, {
          type: 'BALANCE_UPDATE',
          data: {
            balance: parseInt(updatedSenderBalance.Item?.balance?.N ?? '0')
          },
          timestamp: now
        }),
        notifier.notifyUser(resolvedRecipientId, {
          type: 'BALANCE_UPDATE',
          data: {
            balance: parseInt(updatedRecipientBalance.Item?.balance?.N ?? '0')
          },
          timestamp: now
        })
      ]);
    } catch (notificationError) {
      console.error('Error sending WebSocket notifications:', notificationError);
     
    }
    
    return { headers: { 'Access-Control-Allow-Origin': '*' }, statusCode: 200, body: JSON.stringify({ message: 'Transfer completed' }) };
  } catch (err: any) {
    console.error('Error during transfer:', err);
    
   
    if (err.name === 'TransactionCanceledException' && err.CancellationReasons) {
      const balanceFailure = err.CancellationReasons.find((reason: any) => reason.Code === 'ConditionalCheckFailed');
      if (balanceFailure) {
        return { 
          headers: { 'Access-Control-Allow-Origin': '*' }, 
          statusCode: 400, 
          body: JSON.stringify({ message: 'Insufficient balance to complete transfer' }) 
        };
      }
    }
    
    return { 
      headers: { 'Access-Control-Allow-Origin': '*' }, 
      statusCode: 500, 
      body: JSON.stringify({ message: 'Internal server error during transfer' }) 
    };
  }
};
