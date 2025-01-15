'use client';

import { useSearchParams } from 'next/navigation';
import { type Schema } from '@/amplify/data/resource';
import { generateClient } from 'aws-amplify/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

function ResultScreenContent() {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId');
  const matchId = searchParams.get('matchId');

  const [playerNickname, setPlayerNickname] = useState('You');
  const [opponentNickname, setOpponentNickname] = useState('Opponent');
  const [scores, setScores] = useState({ playerScore: 0, opponentScore: 0 });
  const [confettiTriggered, setConfettiTriggered] = useState(false); // State to ensure one-time confetti

  const client = generateClient<Schema>();

  useEffect(() => {
    const fetchScores = async () => {
      if (!playerId || !matchId) return;

      try {
        const playersResponse = await client.models.Player.list({
          filter: { currentMatchId: { eq: matchId } },
        });

        const players = playersResponse.data;

        if (!players || players.length !== 2) {
          throw new Error('Players not found');
        }

        const currentPlayer = players.find((p) => p.id === playerId);
        const opponent = players.find((p) => p.id !== playerId);

        if (!currentPlayer || !opponent) {
          throw new Error('Player identification failed');
        }

        setPlayerNickname(currentPlayer.nickname || 'You');
        setOpponentNickname(opponent.nickname || 'Opponent');

        const playerScore = currentPlayer.score || 0;
        const opponentScore = opponent.score || 0;

        setScores({
          playerScore,
          opponentScore,
        });

        // Trigger confetti if player wins and it hasn't been triggered yet
        if (playerScore > opponentScore && !confettiTriggered) {
          setConfettiTriggered(true); // Prevent re-triggering
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { x: 0.5, y: 0.5 }, // Center of the screen
          });
        }
      } catch (error) {
        console.error('Error fetching scores:', error);
        toast.error('Failed to fetch scores');
      }
    };

    fetchScores();
  }, [playerId, matchId, client.models.Player, confettiTriggered]);

  const winner = scores.playerScore > scores.opponentScore ? 'You' : 'Opponent';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-8 space-y-8 text-center">
        <h1 className="text-4xl font-serif font-bold text-gray-800">Game Over!</h1>

        <div className="space-y-4">
          <p className="text-3xl font-bold text-gray-800">
            {winner === 'You' ? 'You Win!' : 'You Lose!'}
          </p>
          <p className="text-xl text-gray-600">Final Scores:</p>
          <div className="flex justify-around text-2xl font-bold">
            <span className="text-blue-500">{playerNickname}: {scores.playerScore}</span>
            <span className="text-red-500">{opponentNickname}: {scores.opponentScore}</span>
          </div>
        </div>

        <div className="pt-6">
          <Link href="/match-room">
            <Button className="w-full text-lg py-6" size="lg">
              Play Again
            </Button>
          </Link>
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-600">
        <p>Debate Duel - Sharpen your wit for the next battle!</p>
      </footer>
    </div>
  );
}

export default function ResultScreen() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResultScreenContent />
    </Suspense>
  );
}
