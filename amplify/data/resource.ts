import { type ClientSchema, a } from '@aws-amplify/backend';

const schema = a.schema({
  Match: a
    .model({
      player1Id: a.string(),
      player2Id: a.string().optional(),
      player1Ready: a.boolean().default(false),
      player2Ready: a.boolean().default(false),
      matchStatus: a.enum(['WAITING', 'MATCHED', 'READY', 'FINISHED']).default('WAITING'),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization([a.allow.public()])
    .subscription([
      a.subscription().on('create'),
      a.subscription().on('update'),
      a.subscription().on('delete'),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = {
  schema,
  mutations: {
    joinMatch: a.mutation({
      args: {
        playerId: a.string(),
      },
      async handler(ctx) {
        const { playerId } = ctx.args;

        // Try to find an available match
        const availableMatch = await ctx.data.Match.firstOrCreate({
          filter: {
            matchStatus: { eq: 'WAITING' },
            player2Id: { attributeExists: false },
          },
          input: {
            player1Id: playerId,
            player1Ready: false,
            player2Ready: false,
            matchStatus: 'WAITING',
          },
        });

        if (availableMatch.created) {
          // New match created as player 1
          return {
            matchId: availableMatch.data.id,
            isPlayer1: true,
            matchStatus: 'WAITING',
          };
        } else {
          // Join existing match as player 2
          const updatedMatch = await ctx.data.Match.update({
            id: availableMatch.data.id,
            player2Id: playerId,
            matchStatus: 'MATCHED',
          });

          return {
            matchId: updatedMatch.id,
            isPlayer1: false,
            matchStatus: 'MATCHED',
          };
        }
      },
    }),

    updatePlayerStatus: a.mutation({
      args: {
        matchId: a.string(),
        playerId: a.string(),
        isReady: a.boolean(),
      },
      async handler(ctx) {
        const { matchId, playerId, isReady } = ctx.args;

        // Get current match
        const match = await ctx.data.Match.get({ id: matchId });
        if (!match) {
          throw new Error('Match not found');
        }

        // Update ready status based on player
        const updates: any = {};
        if (playerId === match.player1Id) {
          updates.player1Ready = isReady;
        } else if (playerId === match.player2Id) {
          updates.player2Ready = isReady;
        } else {
          throw new Error('Player not in match');
        }

        // Check if both players are ready
        const bothReady = 
          (updates.player1Ready ?? match.player1Ready) && 
          (updates.player2Ready ?? match.player2Ready);

        if (bothReady) {
          updates.matchStatus = 'READY';
        }

        // Update match
        const updatedMatch = await ctx.data.Match.update({
          id: matchId,
          ...updates,
        });

        return {
          success: true,
          match: updatedMatch,
        };
      },
    }),
  },
};
