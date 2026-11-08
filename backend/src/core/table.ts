import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const TABLE_NAME = process.env.TABLE_NAME ?? 'answershare';
export const GSI1 = 'GSI1';
export const dynamoClient = new DynamoDBClient({});
export const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const ttlAfterDays = (days: number, from = Date.now()) =>
  Math.floor(from / 1000) + days * 24 * 60 * 60;
