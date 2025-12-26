import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { startRender } from './functions/startRender/resource';
import { renderVideo } from './functions/renderVideo/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  startRender,
  renderVideo,
});

// Allow Lambdas to access the job table and bucket.
backend.data.resources.tables['RenderJob'].grantReadWriteData(
  backend.startRender.resources.lambda
);
backend.data.resources.tables['RenderJob'].grantReadWriteData(
  backend.renderVideo.resources.lambda
);
backend.storage.resources.bucket.grantReadWrite(
  backend.renderVideo.resources.lambda
);
backend.renderVideo.resources.lambda.grantInvoke(
  backend.startRender.resources.lambda
);

backend.startRender.resources.lambda.addEnvironment(
  'RENDER_FUNCTION_NAME',
  backend.renderVideo.resources.lambda.functionName
);
backend.startRender.resources.lambda.addEnvironment(
  'RENDERJOB_TABLE_NAME',
  backend.data.resources.tables['RenderJob'].tableName
);
backend.renderVideo.resources.lambda.addEnvironment(
  'RENDERJOB_TABLE_NAME',
  backend.data.resources.tables['RenderJob'].tableName
);
backend.renderVideo.resources.lambda.addEnvironment(
  'STORAGE_BUCKET_NAME',
  backend.storage.resources.bucket.bucketName
);
backend.renderVideo.resources.lambda.addEnvironment(
  'FFMPEG_PATH',
  '/opt/bin/ffmpeg'
);
backend.renderVideo.resources.lambda.addEnvironment(
  'FFPROBE_PATH',
  '/opt/bin/ffprobe'
);
