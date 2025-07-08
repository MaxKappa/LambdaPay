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
  // Validazione del body della richiesta
  if (!event.body) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Body della richiesta mancante' }),
    };
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (error) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Formato JSON non valido' }),
    };
  }

  const { amount, recipientEmail, message } = parsedBody;
  const fromUserId = event.requestContext.authorizer?.claims.sub;
  const fromEmail = event.requestContext.authorizer?.claims.email;
  const fromUsername = event.requestContext.authorizer?.claims.preferred_username || fromEmail?.split('@')[0];

  // Validazione rigorosa dei parametri
  if (!amount || !recipientEmail || !fromUserId || !fromEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti: amount, recipientEmail, fromUserId e fromEmail sono obbligatori' }),
    };
  }

  // Validazione del tipo di dato amount
  if (typeof amount !== 'number' && typeof amount !== 'string') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Amount deve essere un numero' }),
    };
  }

  const numericAmount = Number(amount);

  // Validazione robusta dell'amount
  if (isNaN(numericAmount) || !isFinite(numericAmount)) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Amount non è un numero valido' }),
    };
  }

  // Validazione di sicurezza: l'importo deve essere strettamente positivo
  if (numericAmount <= 0) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'L\'importo deve essere maggiore di zero' }),
    };
  }

  // Validazione precisione decimale (massimo 2 cifre decimali per valori monetari)
  if (Math.round(numericAmount * 100) !== numericAmount * 100) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'L\'importo può avere massimo 2 cifre decimali' }),
    };
  }

  // Validazione di sicurezza: limite massimo per importo richiesto
  const MAX_REQUEST_AMOUNT = 100000; // 100k limite per richieste
  if (numericAmount > MAX_REQUEST_AMOUNT) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: `L'importo richiesto non può superare ${MAX_REQUEST_AMOUNT.toLocaleString('it-IT')} euro` }),
    };
  }

  // Validazione formato email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Formato email non valido' }),
    };
  }

  // Validazione aggiuntiva del messaggio (se presente)
  if (message && typeof message !== 'string') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Il messaggio deve essere una stringa' }),
    };
  }

  // Limitazione lunghezza messaggio
  if (message && message.length > 500) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Il messaggio non può superare 500 caratteri' }),
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
        amount: { N: Math.abs(numericAmount).toString() }, // Forza valore assoluto per sicurezza
        message: { S: (message || '').substring(0, 500) }, // Limita messaggio e forza stringa sicura
        status: { S: 'PENDING' },
        createdAt: { S: now },
        fromEmail: { S: fromEmail },
        toEmail: { S: recipientEmail },
        fromUsername: { S: fromUsername },
        toUsername: { S: toUsername || recipientEmail.split('@')[0] }
      }
    }));

    // Invia notifica WebSocket real-time al destinatario della richiesta
    try {
      const notifier = createWebSocketNotifier();
      
      await notifier.notifyUser(toUserId, {
        type: 'REQUEST',
        data: {
          type: 'NEW_REQUEST',
          requestId,
          amount: numericAmount,
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
      console.error('Errore nell\'invio della notifica WebSocket per nuova richiesta:', notificationError);
      // Non blocchiamo la risposta se la notifica fallisce
    }

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
