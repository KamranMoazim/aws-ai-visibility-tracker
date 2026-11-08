import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const RAW_BUCKET_NAME = process.env.RAW_BUCKET_NAME!;
export const s3Client = new S3Client({});

export const rawAnswerKey = (runId: string, promptId: string, engine: string, sample: number) =>
  `raw/${runId}/${promptId}/${engine}/${sample}.json`;

export async function putJson(bucket: string, key: string, body: unknown): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body),
      ContentType: 'application/json',
    }),
  );
}

export async function getJson<T>(bucket: string, key: string): Promise<T> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return JSON.parse(await response.Body!.transformToString('utf8')) as T;
}
