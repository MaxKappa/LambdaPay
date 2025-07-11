import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('WebSocket message received:', event.body);
  
  // Per ora gestiamo solo i ping/pong per mantenere la connessione attiva
  const body = JSON.parse(event.body || '{}');
  
  if (body.action === 'ping') {
    return {
      statusCode: 200,
      body: JSON.stringify({ action: 'pong', timestamp: new Date().toISOString() })
    };
  }

  return { statusCode: 200, body: 'Message received' };
};
