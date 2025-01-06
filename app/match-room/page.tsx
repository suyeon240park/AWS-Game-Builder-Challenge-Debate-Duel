'use client'

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { generateClient } from 'aws-amplify/api';
import { type Schema } from '@/amplify/data/resource';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const client = generateClient<Schema>();

type Match = Schema['Match']['type'];
type Player = Schema['Player']['type'];

const MatchRoomContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const matchId = searchParams.get('matchId');

  const [match, setMatch] = useState<Match | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchId) {
      router.push('/');
      return;
    }

    const initializeMatch = async () => {
      try {
        const { data: matches } = await client.models.Match.list({
          filter: { id: { eq: matchId } },
        });

        if (matches.length === 0) {
          throw new Error('Match not found');
        }

        const matchData = matches[0];
        setMatch(matchData);

        const { data: playersData } = await client.models.Player.list({
          filter: {
            or: [
              { id: { eq: matchData.player1Id } },
              ...(matchData.player2Id ? [{ id: { eq: matchData.player2Id } }] : []),
            ],
          },
        });

        setPlayers(playersData);

        const currentPlayer = playersData.find(
          (p) => p.id === matchData.player1Id || p.id === matchData.player2Id
        );

        if (currentPlayer) {
          setPlayer(currentPlayer);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error initializing match:', error);
        setLoading(false);
        router.push('/');
      }
    };

    initializeMatch();

    const subscription = client.models.Match.observeQuery({
      filter: { id: { eq: matchId } },
    }).subscribe({
      next: async ({ items }) => {
        if (items.length > 0) {
          const updatedMatch = items[0];
          setMatch(updatedMatch);

          const { data: updatedPlayers } = await client.models.Player.list({
            filter: {
              or: [
                { id: { eq: updatedMatch.player1Id } },
                ...(updatedMatch.player2Id ? [{ id: { eq: updatedMatch.player2Id } }] : []),
              ],
            },
          });
          setPlayers(updatedPlayers);

          if (updatedMatch.player1Ready && updatedMatch.player2Ready) {
            router.push(`/arena?matchId=${matchId}`)
          }
        } else {
          router.push('/');
        }
      },
      error: (error) => {
        console.error('Subscription error:', error);
      },
    });

    return () => subscription.unsubscribe();
  }, [matchId, router]);

  const handleReady = async () => {
    if (!match || !player) return;

    try {
      const isPlayer1 = match.player1Id === player.id;
      await client.models.Match.update({
        id: match.id,
        ...(isPlayer1 ? { player1Ready: true } : { player2Ready: true }),
      });
    } catch (error) {
      console.error('Error updating ready status:', error);
    }
  };

  const handleUndoReady = async () => {
    if (!match || !player) return;

    try {
      const isPlayer1 = match.player1Id === player.id;
      await client.models.Match.update({
        id: match.id,
        ...(isPlayer1 ? { player1Ready: false } : { player2Ready: false }),
      });
    } catch (error) {
      console.error('Error undoing ready status:', error);
    }
  };

  const handleLeave = async () => {
    if (!match || !player) return;
  
    try {
      const isPlayer1 = match.player1Id === player.id;
      const player2 = players.find(p => p.id === match.player2Id);
  
      // Case 1: Player 1 leaves with Player 2 present
      if (isPlayer1) {
        if (match.player2Id && player2) {
          // Update match with Player 2 becoming Player 1
          await client.models.Match.update({
            id: match.id,
            player1Id: match.player2Id,
            player2Id: undefined,
            player1Ready: match.player2Ready,
            player2Ready: false,
            matchStatus: 'WAITING',
          });
        }
        // If no Player 2, delete the match
        else {
          await client.models.Match.delete({ id: match.id });
        }
      }
      // Case 2: Player 2 leaves
      else {
        // Just remove Player 2 from match and delete Player 2's entry
        await client.models.Match.update({
          id: match.id,
          player2Id: undefined,
          player2Ready: false,
          matchStatus: 'WAITING',
        });   
      }

      // Delete the player
      await client.models.Player.delete({ id: player.id });
      router.push('/');
    } catch (error) {
      console.error('Error leaving match:', error);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading match room...</div>
      </div>
    );
  }

  if (!match || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Error loading match room</div>
      </div>
    );
  }

  const PlayerStatus = ({ name, ready }: { name: string; ready: boolean }) => (
    <div className="text-center">
      <p className="text-lg font-semibold">{name}</p>
      <p className={`text-sm ${ready ? 'text-green-600' : 'text-red-600'}`}>
        {ready ? 'Ready' : 'Not Ready'}
      </p>
    </div>
  );  

  const matchState = match?.matchStatus
  const playerNickname = player?.nickname
  const isPlayer1 = match?.player1Id === player?.id
  const opponentNickname = isPlayer1 
    ? players.find(p => p.id === match?.player2Id)?.nickname 
    : players.find(p => p.id === match?.player1Id)?.nickname
  const opponentReady = isPlayer1 ? !!match?.player2Ready : !!match?.player1Ready
  const isReady = isPlayer1 ? !!match?.player1Ready : !!match?.player2Ready
  
  const renderPlayerStatuses = () => {
    if (isPlayer1) {
      return (
        <>
          <PlayerStatus name={playerNickname || 'You'} ready={isReady} />
          <span className="text-2xl font-bold text-gray-600">VS</span>
          <PlayerStatus name={opponentNickname || 'Waiting...'} ready={opponentReady} />
        </>
      );
    } else {
      return (
        <>
          <PlayerStatus name={opponentNickname || 'Waiting...'} ready={opponentReady} />
          <span className="text-2xl font-bold text-gray-600">VS</span>
          <PlayerStatus name={playerNickname || 'You'} ready={isReady} />
        </>
      );
    }
  };
  

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8 space-y-8">
        <h1 className="text-4xl font-serif font-bold text-gray-800 text-center">Match Room</h1>

        {matchState === 'WAITING' && (
          <div className="text-center space-y-4">
            <Loader2 className="animate-spin h-12 w-12 mx-auto text-gray-600" />
            <p className="text-xl text-gray-700">Waiting for an opponent...</p>
          </div>
        )}

        {matchState === 'MATCHED' && (
          <div className="space-y-6">
            <p className="text-xl text-gray-700 text-center">
              {opponentNickname ? `${opponentNickname} has joined! Are you ready to duel?` : 'Opponent found! Are you ready to duel?'}
            </p>
            <div className="flex justify-around items-center">
              {renderPlayerStatuses()}
            </div>
            <Button 
              className={`w-full text-lg py-6 ${
                isReady 
                  ? 'bg-yellow-400 hover:bg-yellow-500' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              size="lg" 
              onClick={isReady ? handleUndoReady : handleReady}
            >
              {isReady ? "Unready" : "Ready"}
            </Button>
          </div>
        )}

        {matchState === 'READY' && (
          <div className="text-center space-y-4">
            <p className="text-2xl text-green-600 font-bold">Both players are ready!</p>
            <div className="flex justify-around items-center">
              {renderPlayerStatuses()}
            </div>
            <p className="text-xl text-gray-700">Preparing the debate arena...</p>
            <Loader2 className="animate-spin h-12 w-12 mx-auto text-gray-600" />
          </div>
        )}

        <Button 
          className="mt-4 w-full text-lg py-4 bg-red-500 hover:bg-red-600 text-white" 
          onClick={handleLeave}
        >
          Leave Match
        </Button>
      </div>
    </div>
  );
}

export default function MatchRoom() {
  return (
    <Suspense fallback={<div>Loading match room...</div>}>
      <MatchRoomContent />
    </Suspense>
  );
}
