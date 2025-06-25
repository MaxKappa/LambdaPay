import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({});
const TABLE = process.env.TRANSACTIONS_TABLE!;

export const handler = async () => {
  const { Items } = await db.send(new ScanCommand({ TableName: TABLE }));
  return {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
    statusCode: 200,
    body: JSON.stringify(Items),
  };
};
