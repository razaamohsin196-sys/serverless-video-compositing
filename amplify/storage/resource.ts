import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'media',
  access: (allow) => ({
    'inputs/*': [allow.authenticated.to(['read', 'write'])],
    'outputs/*': [allow.authenticated.to(['read', 'write'])],
  }),
});
