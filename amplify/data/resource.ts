import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  // 1. Match data
  Match: a.model({
    player1Id: a.string().required(),
    player2Id: a.string(),
    player1Ready: a.boolean().default(false),
    player2Ready: a.boolean().default(false),
    matchStatus: a.enum(['WAITING', 'MATCHED', 'READY', 'IN_PROGRESS', 'FINISHED'])
  })
  .authorization(allow => [allow.publicApiKey()]),

  // 2. Player data
  Player: a.model({
    nickname: a.string().required(),
    currentMatchId: a.string(),
    score: a.integer()
  })
  .authorization(allow => [allow.publicApiKey()]),

  GameState: a.model({
    matchId: a.string(),  // Reference back to Match
    currentTurn: a.string(),
    roundNumber: a.integer().default(1),
    player1Score: a.integer().default(0),
    player2Score: a.integer().default(0),
    player1Argument: a.string(),
    player2Argument: a.string(),
    topic: a.string(),
    phase: a.enum(['topic', 'debate', 'transition']),
    timeRemaining: a.integer().default(30)
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
