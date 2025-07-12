import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { createWebSocketNotifier } from '../utils/websocketNotifier';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const REQUESTS_TABLE = process.env.REQUESTS_TABLE!;
const BALANCE_TABLE = process.env.BALANCE_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;

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

  const requestId = event.pathParameters?.requestId;
  const { action } = parsedBody;
  const userId = event.requestContext.authorizer?.claims.sub;
  const userEmail = event.requestContext.authorizer?.claims.email;
  const username = event.requestContext.authorizer?.claims.preferred_username || userEmail?.split('@')[0];

 
  if (!requestId || !action || !userId || !userEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing parameters: requestId, action, userId and userEmail are required' }),
    };
  }

 
  if (action !== 'ACCEPT' && action !== 'REJECT') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid action. Use ACCEPT or REJECT' }),
    };
  }

 
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(requestId)) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid requestId format' }),
    };
  }

  try {
   
    const requestItem = await db.send(new GetItemCommand({
      TableName: REQUESTS_TABLE,
      Key: { requestId: { S: requestId } }
    }));

    if (!requestItem.Item) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 404,
        body: JSON.stringify({ message: 'Request not found' }),
      };
    }

    const request = requestItem.Item;
    
   
    if (request.toUserId.S !== userId) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 403,
        body: JSON.stringify({ message: 'Unauthorized to respond to this request' }),
      };
    }

   
    if (request.status.S !== 'PENDING') {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'This request has already been processed' }),
      };
    }

    const amount = parseFloat(request.amount.N!);
    
   
    if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid request amount' }),
      };
    }

   
    if (Math.round(amount * 100) !== amount * 100) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Amount with invalid decimal precision' }),
      };
    }

    const fromUserId = request.fromUserId.S!;
    const now = new Date().toISOString();

    if (action === 'REJECT') {
     
      await db.send(new UpdateItemCommand({
        TableName: REQUESTS_TABLE,
        Key: { requestId: { S: requestId } },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { 
          ':status': { S: 'REJECTED' },
          ':updatedAt': { S: now }
        }
      }));

     
      try {
        const notifier = createWebSocketNotifier();
        
       
        await notifier.notifyUser(fromUserId, {
          type: 'REQUEST',
          data: {
            type: 'REJECTED',
            requestId,
            amount,
            from: {
              id: userId,
              email: userEmail,
              username
            },
            timestamp: now
          },
          timestamp: now
        });
      } catch (notificationError) {
        console.error('Error sending WebSocket notification for rejection:', notificationError);
      }

      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 200,
        body: JSON.stringify({ message: 'Request rejected' })
      };
    }

   
    const payerBalanceRes = await db.send(new GetItemCommand({
      TableName: BALANCE_TABLE,
      Key: { userId: { S: userId } }
    }));
    const payerBalance = parseInt(payerBalanceRes.Item?.balance?.N ?? '0');
    
    if (payerBalance < amount) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Insufficient balance to accept request' }),
      };
    }

    const transactionId = uuidv4();

   
    await db.send(new TransactWriteItemsCommand({
      TransactItems: [
       
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: userId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) - :amt',
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(amount).toString() },
              ':zero': { N: '0' } 
            },
            ConditionExpression: 'balance >= :amt AND :amt > :zero'
          }
        },
       
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: fromUserId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(amount).toString() },
              ':zero': { N: '0' } 
            },
            ConditionExpression: ':amt > :zero'
          }
        },
       
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: userId },
              transactionId: { S: transactionId },
              amount: { N: (-Math.abs(amount)).toString() },
              date: { S: now },
              to: { S: fromUserId },
              toEmail: { S: request.fromEmail.S! },
              toUsername: { S: request.fromUsername.S! },
              type: { S: 'REQUEST_PAYMENT' }
            }
          }
        },
       
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: fromUserId },
              transactionId: { S: transactionId },
              amount: { N: Math.abs(amount).toString() },
              date: { S: now },
              from: { S: userId },
              fromEmail: { S: userEmail },
              fromUsername: { S: username },
              type: { S: 'REQUEST_RECEIVED' }
            }
          }
        },
       
        {
          Update: {
            TableName: REQUESTS_TABLE,
            Key: { requestId: { S: requestId } },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, transactionId = :transactionId',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { 
              ':status': { S: 'ACCEPTED' },
              ':updatedAt': { S: now },
              ':transactionId': { S: transactionId }
            }
          }
        }
      ]
    }));

   
    try {
      const notifier = createWebSocketNotifier();
      
     
      await notifier.notifyUser(fromUserId, {
        type: 'REQUEST',
        data: {
          type: 'ACCEPTED',
          requestId,
          amount,
          from: {
            id: userId,
            email: userEmail,
            username
          },
          transactionId,
          timestamp: now
        },
        timestamp: now
      });

     
      await notifier.notifyUser(fromUserId, {
        type: 'TRANSACTION',
        data: {
          type: 'RECEIVED',
          amount,
          from: {
            id: userId,
            email: userEmail,
            username
          },
          transactionId,
          timestamp: now,
          source: 'REQUEST'
        },
        timestamp: now
      });

     
      await notifier.notifyUser(userId, {
        type: 'TRANSACTION',
        data: {
          type: 'SENT',
          amount,
          to: {
            id: fromUserId,
            email: request.fromEmail.S!,
            username: request.fromUsername.S!
          },
          transactionId,
          timestamp: now,
          source: 'REQUEST'
        },
        timestamp: now
      });

     
      const [updatedPayerBalance, updatedReceiverBalance] = await Promise.all([
        db.send(new GetItemCommand({
          TableName: BALANCE_TABLE,
          Key: { userId: { S: userId } }
        })),
        db.send(new GetItemCommand({
          TableName: BALANCE_TABLE,
          Key: { userId: { S: fromUserId } }
        }))
      ]);

      await Promise.all([
        notifier.notifyUser(userId, {
          type: 'BALANCE_UPDATE',
          data: {
            balance: parseFloat(updatedPayerBalance.Item?.balance?.N ?? '0')
          },
          timestamp: now
        }),
        notifier.notifyUser(fromUserId, {
          type: 'BALANCE_UPDATE',
          data: {
            balance: parseFloat(updatedReceiverBalance.Item?.balance?.N ?? '0')
          },
          timestamp: now
        })
      ]);
    } catch (notificationError) {
      console.error('Error sending WebSocket notifications for acceptance:', notificationError);
    }      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Request accepted and payment completed',
          transactionId: transactionId
        })
      };

  } catch (err: any) {
    console.error('Error handling request:', err);
    
   
    if (err.name === 'TransactionCanceledException' && err.CancellationReasons) {
      const balanceFailure = err.CancellationReasons.find((reason: any) => reason.Code === 'ConditionalCheckFailed');
      if (balanceFailure) {
        return { 
          headers: { 'Access-Control-Allow-Origin': '*' }, 
          statusCode: 400, 
          body: JSON.stringify({ message: 'Insufficient balance to complete payment' }) 
        };
      }
    }
    
    if (err.name === 'ConditionalCheckFailedException') {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Insufficient balance' })
      };
    }
    
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error while handling request' })
    };
  }
};
