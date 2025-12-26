import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const execFileAsync = promisify(execFile);
const ddb = new DynamoDBClient({});
const s3 = new S3Client({});

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? '/opt/ffmpeg/ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH ?? '/opt/ffmpeg/ffprobe';
const JOB_TABLE = process.env.RENDERJOB_TABLE_NAME ?? '';
const BUCKET = process.env.STORAGE_BUCKET_NAME ?? '';

const tmpPath = (name: string) => `/tmp/${name}`;

const updateJob = async (
  jobId: string,
  values: { status?: string; outputVideoPath?: string; errorMessage?: string }
) => {
  const updateExpressions: string[] = [];
  const names: Record<string, string> = {};
  const attrs: Record<string, { S: string }> = {};

  if (values.status) {
    updateExpressions.push('#status = :status');
    names['#status'] = 'status';
    attrs[':status'] = { S: values.status };
  }

  if (values.outputVideoPath) {
    updateExpressions.push('#outputVideoPath = :outputVideoPath');
    names['#outputVideoPath'] = 'outputVideoPath';
    attrs[':outputVideoPath'] = { S: values.outputVideoPath };
  }

  if (values.errorMessage !== undefined) {
    updateExpressions.push('#errorMessage = :errorMessage');
    names['#errorMessage'] = 'errorMessage';
    attrs[':errorMessage'] = { S: values.errorMessage };
  }

  if (updateExpressions.length === 0) return;

  await ddb.send(
    new UpdateItemCommand({
      TableName: JOB_TABLE,
      Key: { id: { S: jobId } },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: attrs,
    })
  );
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getJob = async (jobId: string, attempts = 5) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await ddb.send(
      new GetItemCommand({
        TableName: JOB_TABLE,
        Key: { id: { S: jobId } },
        ConsistentRead: true,
      })
    );
    if (response.Item) {
      return unmarshall(response.Item) as {
        id: string;
        inputVideoPath: string;
        backgroundImagePath: string;
        corners: string | { x: number; y: number }[];
      };
    }
    if (attempt < attempts) {
      await sleep(250 * attempt);
    }
  }
  return null;
};

const downloadToFile = async (key: string, destination: string) => {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
  if (!response.Body) {
    throw new Error(`Missing body for ${key}`);
  }
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(destination));
};

const run = async (bin: string, args: string[]) => {
  const result = await execFileAsync(bin, args, { maxBuffer: 1024 * 1024 * 10 });
  return result.stdout.trim();
};

const runFfmpeg = (args: string[], timeoutMs = 120000) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8192);
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      const suffix = detail ? ` ffmpeg stderr: ${detail}` : '';
      reject(
        new Error(
          `ffmpeg failed (code ${code ?? 'null'}, signal ${signal ?? 'none'}).${suffix}`
        )
      );
    });
  });

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const writeQuadMask = async (
  filePath: string,
  width: number,
  height: number,
  points: { x: number; y: number }[]
) => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const data = new Uint8Array(w * h);
  const polygon = points.map((point) => ({
    x: clamp(point.x, 0, w - 1),
    y: clamp(point.y, 0, h - 1),
  }));

  for (let y = 0; y < h; y += 1) {
    const scanY = y + 0.5;
    const intersections: number[] = [];

    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (a.y === b.y) continue;
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (scanY >= minY && scanY < maxY) {
        const t = (scanY - a.y) / (b.y - a.y);
        const x = a.x + t * (b.x - a.x);
        intersections.push(x);
      }
    }

    intersections.sort((left, right) => left - right);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      let start = Math.ceil(intersections[i]);
      let end = Math.floor(intersections[i + 1]);
      if (end < 0 || start >= w) continue;
      start = Math.max(0, start);
      end = Math.min(w - 1, end);
      for (let x = start; x <= end; x += 1) {
        data[y * w + x] = 255;
      }
    }
  }

  const header = `P5\n${w} ${h}\n255\n`;
  const buffer = Buffer.concat([Buffer.from(header, 'ascii'), Buffer.from(data)]);
  await writeFile(filePath, buffer);
};

const getDimensions = async (filePath: string) => {
  const output = await run(FFPROBE_PATH, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    filePath,
  ]);
  const [width, height] = output.split('x').map((value) => Number(value));
  return { width, height };
};

const getDurationSeconds = async (filePath: string) => {
  const output = await run(FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return Number(output);
};

export const handler = async (event: { jobId?: string }) => {
  if (!JOB_TABLE || !BUCKET) {
    throw new Error('Missing required environment variables');
  }

  const jobId = event.jobId;
  if (!jobId) {
    throw new Error('Missing jobId');
  }

  console.log('renderVideo: start', { jobId });
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Render job not found: ${jobId}`);
  }

  await updateJob(jobId, { status: 'PROCESSING', errorMessage: '' });

  try {
    console.log('renderVideo: downloading inputs', {
      inputVideoPath: job.inputVideoPath,
      backgroundImagePath: job.backgroundImagePath,
    });
    const inputVideoFile = tmpPath(`${jobId}-input.mp4`);
    const backgroundFile = tmpPath(`${jobId}-bg`);
    const outputFile = tmpPath(`${jobId}-output.mp4`);

    await downloadToFile(job.inputVideoPath, inputVideoFile);
    await downloadToFile(job.backgroundImagePath, backgroundFile);

    const duration = await getDurationSeconds(inputVideoFile);
    console.log('renderVideo: video duration', { seconds: duration });
    if (duration > 10.5) {
      throw new Error(`Input video is too long (${duration.toFixed(2)}s > 10s)`);
    }
    const durationLimit = Math.min(duration, 10);
    console.log('renderVideo: duration limit', { seconds: durationLimit });

    const { width, height } = await getDimensions(backgroundFile);
    console.log('renderVideo: background size', { width, height });
    const corners =
      typeof job.corners === 'string' ? JSON.parse(job.corners) : job.corners;
    const [tl, tr, bl, br] = corners as { x: number; y: number }[];
    const maskFile = tmpPath(`${jobId}-mask.pgm`);
    await writeQuadMask(maskFile, width, height, [tl, tr, br, bl]);

    const filter = [
      `[1:v]scale=${width}:${height},format=rgba,`,
      `perspective=${tl.x}:${tl.y}:${tr.x}:${tr.y}:${bl.x}:${bl.y}:${br.x}:${br.y}:sense=destination:interpolation=cubic[warped];`,
      `[2:v]scale=${width}:${height},format=gray[mask];`,
      `[warped][mask]alphamerge[warpedAlpha];`,
      `[0:v]scale=${width}:${height},format=rgba[bg];`,
      `[bg][warpedAlpha]overlay=0:0:format=auto,format=yuv420p[outv]`,
    ].join('');

    const ffmpegArgs = [
      '-y',
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-loop',
      '1',
      '-i',
      backgroundFile,
      '-i',
      inputVideoFile,
      '-loop',
      '1',
      '-i',
      maskFile,
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-map',
      '1:a?',
      '-shortest',
      '-t',
      `${durationLimit}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-movflags',
      '+faststart',
      outputFile,
    ];
    console.log('renderVideo: running ffmpeg', { args: ffmpegArgs });
    await runFfmpeg(ffmpegArgs, 300000);

    const outputKey = `outputs/${jobId}/rendered.mp4`;
    const body = await readFile(outputFile);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: outputKey,
        Body: body,
        ContentType: 'video/mp4',
      })
    );

    await updateJob(jobId, { status: 'COMPLETED', outputVideoPath: outputKey });
    console.log('renderVideo: completed', { outputKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('renderVideo: failed', { message });
    await updateJob(jobId, { status: 'FAILED', errorMessage: message });
    throw error;
  }
};
