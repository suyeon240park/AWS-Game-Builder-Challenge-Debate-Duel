import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  // 1. Match data
  Match: a.model({
    player1Id: a.string().required(),
    player2Id: a.string(),
    player1Ready: a.boolean().default(false),
    player2Ready: a.boolean().default(false),
    matchStatus: a.enum(['WAITING', 'MATCHED', 'READY', 'IN_PROGRESS', 'FINISHED']),
    currentTurnPlayerId: a.string(),
    winner: a.string(),
    topic: a.string(),
  })
  .authorization(allow => [allow.publicApiKey()]),

  // 2. Player data
  Player: a.model({
    nickname: a.string().required(),
    currentMatchId: a.string(),
    score: a.integer(),
    turn: a.string(),
    message: a.string(),
  })
  .authorization(allow => [allow.publicApiKey()]),
});

// Used for code completion / highlighting when making requests from frontend
export type Schema = ClientSchema<typeof schema>;

// defines the data resource to be deployed
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 30 }
  }
});
