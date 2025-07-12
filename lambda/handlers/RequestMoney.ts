import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { v4 as uuidv4 } from 'uuid';
import { createWebSocketNotifier } from '../utils/websocketNotifier';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const REQUESTS_TABLE = process.env.REQUESTS_TABLE!;
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

  const { amount, recipientEmail, message } = parsedBody;
  const fromUserId = event.requestContext.authorizer?.claims.sub;
  const fromEmail = event.requestContext.authorizer?.claims.email;
  const fromUsername = event.requestContext.authorizer?.claims.preferred_username || fromEmail?.split('@')[0];

 
  if (!amount || !recipientEmail || !fromUserId || !fromEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing parameters: amount, recipientEmail, fromUserId and fromEmail are required' }),
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

 
  const MAX_REQUEST_AMOUNT = 100000;
  if (amountInCents > MAX_REQUEST_AMOUNT) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: `Request amount cannot exceed ${(MAX_REQUEST_AMOUNT / 100).toLocaleString('en-US')} dollars` }),
    };
  }

 
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid email format' }),
    };
  }

 
  if (message && typeof message !== 'string') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Message must be a string' }),
    };
  }

 
  if (message && message.length > 500) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Message cannot exceed 500 characters' }),
    };
  }

 
  if (recipientEmail === fromEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Cannot request money from yourself' }),
    };
  }

 
  let toUserId: string | undefined;
  let toUsername: string | undefined;
  try {
    const usersRes = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${recipientEmail}"`,
      Limit: 1
    }));
    if (usersRes.Users && usersRes.Users.length > 0) {
      toUserId = usersRes.Users[0].Attributes?.find(attr => attr.Name === "sub")?.Value;
      toUsername = usersRes.Users[0].Attributes?.find(attr => attr.Name === "preferred_username")?.Value;
    }
  } catch (err) {
    console.error("Error searching Cognito user:", err);
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Error searching recipient user' }),
    };
  }

  if (!toUserId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 404,
      body: JSON.stringify({ message: 'Recipient not found' }),
    };
  }

  const requestId = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.send(new PutItemCommand({
      TableName: REQUESTS_TABLE,
      Item: {
        requestId: { S: requestId },
        fromUserId: { S: fromUserId },
        toUserId: { S: toUserId },
        amount: { N: Math.abs(amountInCents).toString() },
        message: { S: (message || '').substring(0, 500) },
        status: { S: 'PENDING' },
        createdAt: { S: now },
        fromEmail: { S: fromEmail },
        toEmail: { S: recipientEmail },
        fromUsername: { S: fromUsername },
        toUsername: { S: toUsername || recipientEmail.split('@')[0] }
      }
    }));

   
    try {
      const notifier = createWebSocketNotifier();
      
      await notifier.notifyUser(toUserId, {
        type: 'REQUEST',
        data: {
          type: 'NEW_REQUEST',
          requestId,
          amount: amountInCents,
          message: (message || '').substring(0, 500),
          from: {
            id: fromUserId,
            email: fromEmail,
            username: fromUsername
          },
          timestamp: now
        },
        timestamp: now
      });
    } catch (notificationError) {
      console.error('Error sending WebSocket notification for new request:', notificationError);
     
    }

    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Money request sent successfully',
        requestId: requestId
      })
    };
  } catch (err: any) {
    console.error(err);
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Error sending request' })
    };
  }
};
