import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  Match: a.model({
    player1Id: a.string().required(),
    player2Id: a.string(),
    player1Ready: a.boolean().default(false),
    player2Ready: a.boolean().default(false),
    matchStatus: a.enum(['WAITING', 'MATCHED', 'READY']),
    roundNumber: a.integer().required().default(1),
    currentTurn: a.integer().required().default(1),
    timer: a.integer().default(30),
    player1Argument: a.string(),
    player2Argument: a.string(),
    typingPlayerId: a.string(),
    isTyping: a.boolean()
  })
  .authorization(allow => [allow.publicApiKey()]),

  Player: a.model({
    nickname: a.string().required(),
    currentMatchId: a.string(),
    argument: a.string(),
    score: a.integer().default(0)
  })
  .authorization(allow => [allow.publicApiKey()])
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
