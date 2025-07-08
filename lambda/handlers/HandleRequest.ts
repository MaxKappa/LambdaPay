import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { createWebSocketNotifier } from '../utils/websocketNotifier';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const REQUESTS_TABLE = process.env.REQUESTS_TABLE!;
const BALANCE_TABLE = process.env.BALANCE_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;

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

  const requestId = event.pathParameters?.requestId;
  const { action } = parsedBody;
  const userId = event.requestContext.authorizer?.claims.sub;
  const userEmail = event.requestContext.authorizer?.claims.email;
  const username = event.requestContext.authorizer?.claims.preferred_username || userEmail?.split('@')[0];

  // Validazione rigorosa dei parametri
  if (!requestId || !action || !userId || !userEmail) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti: requestId, action, userId e userEmail sono obbligatori' }),
    };
  }

  // Validazione dell'azione
  if (action !== 'ACCEPT' && action !== 'REJECT') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Azione non valida. Usa ACCEPT o REJECT' }),
    };
  }

  // Validazione formato requestId (deve essere un UUID valido)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(requestId)) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Formato requestId non valido' }),
    };
  }

  try {
    // Recupera la richiesta
    const requestItem = await db.send(new GetItemCommand({
      TableName: REQUESTS_TABLE,
      Key: { requestId: { S: requestId } }
    }));

    if (!requestItem.Item) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 404,
        body: JSON.stringify({ message: 'Richiesta non trovata' }),
      };
    }

    const request = requestItem.Item;
    
    // Verifica che l'utente corrente sia il destinatario della richiesta
    if (request.toUserId.S !== userId) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 403,
        body: JSON.stringify({ message: 'Non autorizzato a rispondere a questa richiesta' }),
      };
    }

    // Verifica che la richiesta sia ancora in pending
    if (request.status.S !== 'PENDING') {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Questa richiesta è già stata processata' }),
      };
    }

    const amount = parseFloat(request.amount.N!);
    
    // Validazione aggiuntiva sull'amount dalla richiesta memorizzata
    if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Importo della richiesta non valido' }),
      };
    }

    // Validazione di sicurezza: verifica che l'amount non sia stato manipolato
    if (Math.round(amount * 100) !== amount * 100) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Importo con precisione decimale non valida' }),
      };
    }

    const fromUserId = request.fromUserId.S!;
    const now = new Date().toISOString();

    if (action === 'REJECT') {
      // Aggiorna solo lo status della richiesta
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

      // Invia notifica WebSocket di richiesta rifiutata
      try {
        const notifier = createWebSocketNotifier();
        
        // Notifica al richiedente che la richiesta è stata rifiutata
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
        console.error('Errore nell\'invio della notifica WebSocket per rifiuto:', notificationError);
      }

      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 200,
        body: JSON.stringify({ message: 'Richiesta rifiutata' })
      };
    }

    // Se ACCEPT, verifica il saldo del destinatario (che sta pagando)
    const payerBalanceRes = await db.send(new GetItemCommand({
      TableName: BALANCE_TABLE,
      Key: { userId: { S: userId } }
    }));
    const payerBalance = parseInt(payerBalanceRes.Item?.balance?.N ?? '0');
    
    if (payerBalance < amount) {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Saldo insufficiente per accettare la richiesta' }),
      };
    }

    const transactionId = uuidv4();

    // Esegui il trasferimento e aggiorna la richiesta
    await db.send(new TransactWriteItemsCommand({
      TransactItems: [
        // Aggiorna saldo del pagatore (sottrae denaro)
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: userId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) - :amt',
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(amount).toString() }, // Forza valore assoluto per sicurezza
              ':zero': { N: '0' } 
            },
            ConditionExpression: 'balance >= :amt AND :amt > :zero' // Doppia verifica
          }
        },
        // Aggiorna saldo del ricevente (aggiunge denaro)
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: fromUserId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { 
              ':amt': { N: Math.abs(amount).toString() }, // Forza valore assoluto per sicurezza
              ':zero': { N: '0' } 
            },
            ConditionExpression: ':amt > :zero' // Verifica che l'amount sia positivo
          }
        },
        // Crea transazione per il pagatore (negativa)
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: userId },
              transactionId: { S: transactionId },
              amount: { N: (-Math.abs(amount)).toString() }, // Forza negativo assoluto
              date: { S: now },
              to: { S: fromUserId },
              toEmail: { S: request.fromEmail.S! },
              toUsername: { S: request.fromUsername.S! },
              type: { S: 'REQUEST_PAYMENT' }
            }
          }
        },
        // Crea transazione per il ricevente (positiva)
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: fromUserId },
              transactionId: { S: transactionId },
              amount: { N: Math.abs(amount).toString() }, // Forza positivo assoluto
              date: { S: now },
              from: { S: userId },
              fromEmail: { S: userEmail },
              fromUsername: { S: username },
              type: { S: 'REQUEST_RECEIVED' }
            }
          }
        },
        // Aggiorna lo status della richiesta
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

    // Invia notifiche WebSocket real-time per accettazione richiesta
    try {
      const notifier = createWebSocketNotifier();
      
      // Notifica al richiedente che la richiesta è stata accettata e il pagamento ricevuto
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

      // Notifica al richiedente anche della transazione ricevuta
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

      // Notifica al pagatore della transazione inviata
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

      // Notifica aggiornamento saldo a entrambi
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
      console.error('Errore nell\'invio delle notifiche WebSocket per accettazione:', notificationError);
    }

    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Richiesta accettata e pagamento completato',
        transactionId: transactionId
      })
    };

  } catch (err: any) {
    console.error('Errore durante la gestione della richiesta:', err);
    
    // Gestione specifica per errori di condizione (saldo insufficiente)
    if (err.name === 'TransactionCanceledException' && err.CancellationReasons) {
      const balanceFailure = err.CancellationReasons.find((reason: any) => reason.Code === 'ConditionalCheckFailed');
      if (balanceFailure) {
        return { 
          headers: { 'Access-Control-Allow-Origin': '*' }, 
          statusCode: 400, 
          body: JSON.stringify({ message: 'Saldo insufficiente per completare il pagamento' }) 
        };
      }
    }
    
    if (err.name === 'ConditionalCheckFailedException') {
      return {
        headers: { 'Access-Control-Allow-Origin': '*' },
        statusCode: 400,
        body: JSON.stringify({ message: 'Saldo insufficiente' })
      };
    }
    
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 500,
      body: JSON.stringify({ message: 'Errore interno del server durante la gestione della richiesta' })
    };
  }
};
