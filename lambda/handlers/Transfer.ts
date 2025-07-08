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

  const { amount, recipientId } = parsedBody;
  const senderId = event.requestContext.authorizer?.claims.sub;
  
  // Validazione rigorosa dei parametri
  if (!amount || !recipientId || !senderId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti: amount, recipientId e senderId sono obbligatori' }),
    };
  }

  // Validazione del tipo di dato amount - deve essere numerico e convertibile
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

  // Validazione di sicurezza: limite massimo per importo (es. 1 milione)
  const MAX_TRANSFER_AMOUNT = 1000000;
  if (numericAmount > MAX_TRANSFER_AMOUNT) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: `L'importo non può superare ${MAX_TRANSFER_AMOUNT.toLocaleString('it-IT')} euro` }),
    };
  }

  // Impedisce auto-trasferimenti
  const senderEmail = event.requestContext.authorizer?.claims.email;
  if (recipientId === senderEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Non puoi trasferire denaro a te stesso' }),
    };
  }

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
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(numericAmount).toString() }, // Forza valore assoluto per sicurezza
              ':zero': { N: '0' } 
            },
            ConditionExpression: 'balance >= :amt AND :amt > :zero' // Doppia verifica
          }
        },
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: resolvedRecipientId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(numericAmount).toString() }, // Forza valore assoluto per sicurezza
              ':zero': { N: '0' } 
            },
            ConditionExpression: ':amt > :zero' // Verifica che l'amount sia positivo
          }
        },
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: senderId },
              transactionId: { S: transactionId },
              amount: { N: (-Math.abs(numericAmount)).toString() }, // Forza negativo assoluto
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
              amount: { N: Math.abs(numericAmount).toString() }, // Forza positivo assoluto
              date: { S: now },
              from: { S: senderId },
              fromEmail: { S: event.requestContext.authorizer?.claims.email || '' },
              fromUsername: { S: event.requestContext.authorizer?.claims.preferred_username || '' }
            }
          }
        }
      ]
    }));
    
    // Invia notifiche WebSocket real-time
    try {
      const notifier = createWebSocketNotifier();
      const senderUsername = event.requestContext.authorizer?.claims.preferred_username || senderEmail?.split('@')[0] || 'Utente';
      
      // Notifica al destinatario del pagamento ricevuto
      await notifier.notifyUser(resolvedRecipientId, {
        type: 'TRANSACTION',
        data: {
          type: 'RECEIVED',
          amount: numericAmount,
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

      // Notifica al mittente della conferma di invio
      await notifier.notifyUser(senderId, {
        type: 'TRANSACTION',
        data: {
          type: 'SENT',
          amount: numericAmount,
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

      // Notifica aggiornamento saldo a entrambi
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
            balance: parseFloat(updatedSenderBalance.Item?.balance?.N ?? '0')
          },
          timestamp: now
        }),
        notifier.notifyUser(resolvedRecipientId, {
          type: 'BALANCE_UPDATE',
          data: {
            balance: parseFloat(updatedRecipientBalance.Item?.balance?.N ?? '0')
          },
          timestamp: now
        })
      ]);
    } catch (notificationError) {
      console.error('Errore nell\'invio delle notifiche WebSocket:', notificationError);
      // Non blocchiamo la risposta se le notifiche falliscono
    }
    
    return { headers: { 'Access-Control-Allow-Origin': '*' }, statusCode: 200, body: JSON.stringify({ message: 'Transfer completed' }) };
  } catch (err: any) {
    console.error('Errore durante il trasferimento:', err);
    
    // Gestione specifica per errori di condizione (saldo insufficiente)
    if (err.name === 'TransactionCanceledException' && err.CancellationReasons) {
      const balanceFailure = err.CancellationReasons.find((reason: any) => reason.Code === 'ConditionalCheckFailed');
      if (balanceFailure) {
        return { 
          headers: { 'Access-Control-Allow-Origin': '*' }, 
          statusCode: 400, 
          body: JSON.stringify({ message: 'Saldo insufficiente per completare il trasferimento' }) 
        };
      }
    }
    
    return { 
      headers: { 'Access-Control-Allow-Origin': '*' }, 
      statusCode: 500, 
      body: JSON.stringify({ message: 'Errore interno del server durante il trasferimento' }) 
    };
  }
};
