import { a, defineData, type ClientSchema, defineFunction} from '@aws-amplify/backend';

export const MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

export const generateHaikuFunction = defineFunction({
  entry: "./generateHaiku.ts",
  environment: {
    MODEL_ID,
  },
});

const schema = a.schema({
  evaluateDebate: a
    .query()
    .arguments({ prompt: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(generateHaikuFunction)),

  Match: a.model({
    player1Id: a.string().required(),
    player2Id: a.string(),
    player1Ready: a.boolean().default(false),
    player2Ready: a.boolean().default(false),
    matchStatus: a.enum(['WAITING', 'MATCHED', 'READY', 'FINISHED']),
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