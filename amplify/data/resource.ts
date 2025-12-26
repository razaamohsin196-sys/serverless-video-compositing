import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { startRender } from '../functions/startRender/resource';

const schema = a.schema({
  RenderJob: a
    .model({
      status: a.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
      inputVideoPath: a.string().required(),
      backgroundImagePath: a.string().required(),
      outputVideoPath: a.string(),
      corners: a.json().required(),
      errorMessage: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
  startRender: a
    .mutation()
    .arguments({ jobId: a.id().required() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(startRender)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
