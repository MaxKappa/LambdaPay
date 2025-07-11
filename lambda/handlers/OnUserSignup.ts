import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({ region: 'eu-west-1' });
const TABLE = process.env.BALANCE_TABLE!;

export const handler = async (event: any) => {
  const userId = event.request.userAttributes.sub;
  const WELCOME_BONUS_CENTS = 2000; // $20 in cents
  try {
    await db.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        userId: { S: userId },
        balance: { N: WELCOME_BONUS_CENTS.toString() }
      },
      ConditionExpression: "attribute_not_exists(userId)"
    }));
  } catch (err) {
    console.error("Error creating initial balance:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error creating initial balance' }),
    };
  }
  return event;
};
