import { defineFunction } from '@aws-amplify/backend';

export const startRender = defineFunction({
  name: 'startRender',
  resourceGroupName: 'data',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
