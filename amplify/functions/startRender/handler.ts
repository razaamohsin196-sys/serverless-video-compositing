import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const ddb = new DynamoDBClient({});

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForJob = async (jobId: string, attempts = 8) => {
  const tableName = process.env.RENDERJOB_TABLE_NAME;
  if (!tableName) {
    throw new Error('Missing RENDERJOB_TABLE_NAME env var');
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await ddb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { id: { S: jobId } },
        ConsistentRead: true,
      })
    );
    if (response.Item) {
      return true;
    }
    await sleep(250 * attempt);
  }

  return false;
};

export const handler = async (event: { arguments: { jobId: string } }) => {
  const jobId = event.arguments.jobId;
  if (!process.env.RENDER_FUNCTION_NAME) {
    throw new Error('Missing RENDER_FUNCTION_NAME env var');
  }

  const found = await waitForJob(jobId);
  if (!found) {
    throw new Error(`Render job not found after retry: ${jobId}`);
  }

  console.log('startRender: invoke render lambda', {
    jobId,
    functionName: process.env.RENDER_FUNCTION_NAME,
  });
  const payload = JSON.stringify({ jobId });
  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.RENDER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(payload),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('startRender: invoke failed', { message });
    throw error;
  }

  return 'OK';
};
