import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { v4 as uuidv4 } from 'uuid';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const REQUESTS_TABLE = process.env.REQUESTS_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const { amount, recipientEmail, message } = JSON.parse(event.body!);
  const fromUserId = event.requestContext.authorizer?.claims.sub!;
  const fromEmail = event.requestContext.authorizer?.claims.email!;
  const fromUsername = event.requestContext.authorizer?.claims.preferred_username || fromEmail.split('@')[0];

  if (!amount || isNaN(Number(amount)) || !recipientEmail || !fromUserId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti o amount non valido' }),
    };
  }

  const numericAmount = Number(amount);
  if (numericAmount <= 0) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'L\'importo deve essere maggiore di zero' }),
    };
  }

  // Non può richiedere denaro a se stesso
  if (recipientEmail === fromEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Non puoi richiedere denaro a te stesso' }),
    };
  }

  // Risolvi recipientEmail in userId Cognito
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
    console.error("Errore nella ricerca utente Cognito:", err);
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Errore nella ricerca utente destinatario' }),
    };
  }

  if (!toUserId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 404,
      body: JSON.stringify({ message: 'Destinatario non trovato' }),
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
        amount: { N: numericAmount.toString() },
        message: { S: message || '' },
        status: { S: 'PENDING' },
        createdAt: { S: now },
        fromEmail: { S: fromEmail },
        toEmail: { S: recipientEmail },
        fromUsername: { S: fromUsername },
        toUsername: { S: toUsername || recipientEmail.split('@')[0] }
      }
    }));

    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Richiesta di denaro inviata con successo',
        requestId: requestId
      })
    };
  } catch (err: any) {
    console.error(err);
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Errore nell\'invio della richiesta' })
    };
  }
};
