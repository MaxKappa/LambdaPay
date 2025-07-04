import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const REQUESTS_TABLE = process.env.REQUESTS_TABLE!;
const BALANCE_TABLE = process.env.BALANCE_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestId = event.pathParameters?.requestId;
  const { action } = JSON.parse(event.body!); // 'ACCEPT' or 'REJECT'
  const userId = event.requestContext.authorizer?.claims.sub!;
  const userEmail = event.requestContext.authorizer?.claims.email!;
  const username = event.requestContext.authorizer?.claims.preferred_username || userEmail.split('@')[0];

  if (!requestId || !action || !userId) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Parametri mancanti' }),
    };
  }

  if (action !== 'ACCEPT' && action !== 'REJECT') {
    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 400,
      body: JSON.stringify({ message: 'Azione non valida. Usa ACCEPT o REJECT' }),
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
    const payerBalance = parseFloat(payerBalanceRes.Item?.balance?.N ?? '0');
    
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
            ExpressionAttributeValues: { ':amt': { N: amount.toString() }, ':zero': { N: '0' } },
            ConditionExpression: 'balance >= :amt'
          }
        },
        // Aggiorna saldo del ricevente (aggiunge denaro)
        {
          Update: {
            TableName: BALANCE_TABLE,
            Key: { userId: { S: fromUserId } },
            UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amt',
            ExpressionAttributeValues: { ':amt': { N: amount.toString() }, ':zero': { N: '0' } }
          }
        },
        // Crea transazione per il pagatore (negativa)
        {
          Put: {
            TableName: TRANSACTIONS_TABLE,
            Item: {
              userId: { S: userId },
              transactionId: { S: transactionId },
              amount: { N: (-amount).toString() },
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
              amount: { N: amount.toString() },
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

    return {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Richiesta accettata e pagamento completato',
        transactionId: transactionId
      })
    };

  } catch (err: any) {
    console.error(err);
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
      body: JSON.stringify({ message: 'Errore nel processare la risposta alla richiesta' })
    };
  }
};
