import { defineFunction } from '@aws-amplify/backend';

export const renderVideo = defineFunction({
  name: 'renderVideo',
  resourceGroupName: 'data',
  entry: './handler.ts',
  timeoutSeconds: 900,
  memoryMB: 2048,
  // Attach a Lambda Layer with ffmpeg/ffprobe binaries at /opt/bin.
  layers: ['arn:aws:lambda:eu-north-1:242201278398:layer:ffmpeg:2'],
});
