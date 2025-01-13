"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'
import { type Schema } from '@/amplify/data/resource'
import { generateClient } from 'aws-amplify/api'
import { toast } from 'sonner'

// Constants
const GAME_CONSTANTS = {
  INITIAL_SCORE: 50,
  MAX_ROUNDS: 3,
  TURN_TIME: 30,
  TYPING_TIMEOUT: 1000,
  HIT_ANIMATION_DURATION: 2000,
  MIN_ARGUMENT_LENGTH: 10,
} as const

const TOPICS = [
  "Should artificial intelligence be regulated?",
  "Is social media doing more harm than good?",
  "Should voting be mandatory?",
  "Should college education be free?",
  "Is space exploration worth the cost?",
] as const

// Types
interface GameScore {
  clarity: number
  evidence: number
  content: number
  total: number
}

// Components
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex items-center justify-center">
    <div className="text-2xl font-bold text-gray-700 animate-pulse">Loading arena...</div>
  </div>
)

const ErrorMessage = ({ message }: { message: string }) => (
  <div className="flex items-center gap-2 text-red-600">
    <span>{message}</span>
  </div>
)

// Randomly select a topic
const getRandomTopic = () => {
    const randomIndex = Math.floor(Math.random() * TOPICS.length);
    return TOPICS[randomIndex];
};

const ScoreDisplay = ({ player, opponent }: { player: number, opponent: number }) => (
  <div className="space-y-2">
    <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
      <Progress value={player} className="absolute left-0 h-full bg-blue-500" />
      <Progress value={opponent} className="absolute right-0 h-full bg-red-500" style={{width: `${opponent}%`}} />
    </div>
    <div className="flex justify-between text-sm font-medium text-gray-700">
      <span>{player}</span>
      <span>{opponent}</span>
    </div>
  </div>
)

const client = generateClient<Schema>()

const ArenaPageContent = () => {
  // Router and Params
  const router = useRouter()
  const searchParams = useSearchParams()
  const matchId = searchParams.get('matchId');

  // Game State
  const [match, setMatch] = useState<Schema['Match']['type'] | null>(null)
  const [player, setPlayer] = useState<Schema['Player']['type'] | null>(null)
  const [opponent, setOpponent] = useState<Schema['Player']['type'] | null>(null)

  // UI State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerScore, setPlayerScore] = useState<number>(GAME_CONSTANTS.INITIAL_SCORE)
  const [opponentScore, setOpponentScore] = useState<number>(GAME_CONSTANTS.INITIAL_SCORE)
  const [playerArgument, setPlayerArgument] = useState('')
  const [timer, setTimer] = useState<number>(GAME_CONSTANTS.TURN_TIME)
  const [roundNumber, setRoundNumber] = useState(1)
  const [showHit, setShowHit] = useState(false)
  const [opponentTyping, setOpponentTyping] = useState('')

  // Timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize game
  useEffect(() => {
    if (!matchId) {
      router.push('/')
      return
    }

    const initializeGame = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get match data
        const { data: matchData } = await client.models.Match.get({ id: matchId })
        if (!matchData) throw new Error('Match not found')
        setMatch(matchData)

        // Get players data
        const { data: players } = await client.models.Player.list({
          filter: { currentMatchId: { eq: matchId } }
        })

        const currentPlayer = players.find(p => p.id === matchData.player1Id)
        const opponentPlayer = players.find(p => p.id === matchData.player2Id)

        if (!currentPlayer || !opponentPlayer) throw new Error('Players not found')

        // Assign a topic
        const topic = getRandomTopic();
        await client.models.Match.update({
            id: matchId,
            topic: topic,
            matchStatus: 'IN_PROGRESS'
        });
        matchData.topic = topic

        setPlayer(currentPlayer)
        setOpponent(opponentPlayer)
        setPlayerScore(currentPlayer.score ?? GAME_CONSTANTS.INITIAL_SCORE)
        setOpponentScore(opponentPlayer.score ?? GAME_CONSTANTS.INITIAL_SCORE)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize game'
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    initializeGame()
  }, [matchId, router])


  // Score calculation
  const calculateScore = useCallback((argument: string): GameScore => {
    const wordCount = argument.split(' ').length
    const uniqueWords = new Set(argument.toLowerCase().split(' ')).size
    const avgWordLength = argument.length / wordCount

    const clarity = Math.min(Math.floor(wordCount / 10), 10)
    const evidence = Math.min(Math.floor(uniqueWords / wordCount * 10), 10)
    const content = Math.min(Math.floor(avgWordLength), 10)

    return {
      clarity,
      evidence,
      content,
      total: clarity + evidence + content
    }
  }, [])

// Add timer effect
useEffect(() => {
    if (!match || !matchId) return;

    const timerInterval = setInterval(async () => {
        if (timer > 0) {
            setTimer(prev => prev - 1);
        } else {
            // Auto-submit when time runs out
            if (isPlayerTurn(match, player!.id)) {
                await handleSubmit();
            }
        }
    }, 1000);

    timerRef.current = timerInterval;
    return () => clearInterval(timerInterval);
}, [timer, player?.id, match]);

// Update handlePlayerTyping to use Player's argument field for real-time typing
const handlePlayerTyping = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!match || !player || !isPlayerTurn(match, player.id)) return;
    
    const value = e.target.value;
    setPlayerArgument(value);

    try {
        // Update player's argument field for real-time typing
        await client.models.Player.update({
            id: player.id,
            argument: value
        });
    } catch (error) {
        console.error('Error updating typing status:', error);
    }
}, [match, player]);

// Update subscription to watch opponent's argument changes
useEffect(() => {
    if (!opponent?.id || !match || !player) return;

    const sub = client.models.Player.onUpdate({
        filter: { id: { eq: opponent.id } }
    }).subscribe((updatedPlayer) => {
        if (!isPlayerTurn(match, player.id) && updatedPlayer.argument) {
            setOpponentTyping(updatedPlayer.argument);
        }
    });

    return () => {
        sub.unsubscribe();
    };
}, [opponent?.id, match, player]);

// Update handleTurnEnd
const handleTurnEnd = async () => {
    if (!matchId || !match) return;

    setShowHit(true);
    setTimeout(() => setShowHit(false), GAME_CONSTANTS.HIT_ANIMATION_DURATION);

    try {
        const nextTurn = match.currentTurn === 1 ? 2 : 1;
        const newRoundNumber = nextTurn === 1 ? match.roundNumber! + 1 : match.roundNumber;

        if (newRoundNumber! > GAME_CONSTANTS.MAX_ROUNDS) {
            await client.models.Match.update({
                id: matchId,
                matchStatus: 'FINISHED'
            });
            router.push(`/result?matchId=${matchId}`);
        } else {
            await client.models.Match.update({
                id: matchId,
                currentTurn: nextTurn,
                timeRemaining: GAME_CONSTANTS.TURN_TIME,
                roundNumber: newRoundNumber
            });
        }
    } catch (error) {
        console.error('Error updating turn:', error);
        toast.error('Failed to update turn');
    }
};

// Subscription to match updates
useEffect(() => {
    if (!matchId || !match) return;

    const sub = client.models.Match.onUpdate({
        filter: { id: { eq: matchId } }
    }).subscribe((updatedMatch) => {
        if (!updatedMatch) return;
        
        // Update timer when it changes
        setTimer(updatedMatch.timeRemaining!);
        
        // Update round number when it changes
        if (updatedMatch.roundNumber !== match.roundNumber) {
            setRoundNumber(updatedMatch.roundNumber!);
        }

        // Update match data
        setMatch(updatedMatch);
    });

    return () => {
        sub.unsubscribe();
    };
}, [matchId, match]);


// Update handleSubmit
const handleSubmit = async () => {
    if (!matchId || !player || isSubmitting || !isPlayerTurn(match!, player.id)) return;
    if (playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH) {
        toast.error('Argument is too short');
        return;
    }

    try {
        setIsSubmitting(true);
        const score = calculateScore(playerArgument);

        await client.models.Player.update({
            id: player.id,
            argument: playerArgument,
            score: Math.min((player.score ?? 0) + score.total, 100)
        });

        setPlayerArgument('');
        await handleTurnEnd();

    } catch (error) {
        console.error('Error submitting argument:', error);
        toast.error('Failed to submit argument');
    } finally {
        setIsSubmitting(false);
    }
};

// Add this helper function
const isPlayerTurn = (match: Schema['Match']['type'], playerId: string): boolean => {
    return (playerId === match.player1Id && match.currentTurn === 1) ||
           (playerId === match.player2Id && match.currentTurn === 2);
};

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!match || !player || !opponent) return <ErrorMessage message="Game data not found" />

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Round {roundNumber}/{GAME_CONSTANTS.MAX_ROUNDS}</h1>
            <p className="text-sm text-gray-500">Topic: {match.topic}</p>
          </div>
          <div className="text-3xl font-bold text-red-600 animate-pulse">{timer}s</div>
        </div>

        <ScoreDisplay player={playerScore} opponent={opponentScore} />

        <div className="flex justify-between items-center text-sm">
          <div>
            <span className="font-semibold">{player.nickname}</span>
            {isPlayerTurn(match, player.id) && <span className="ml-2 text-green-500">(Your turn)</span>}
          </div>
          <div>
            <span className="font-semibold">{opponent.nickname}</span>
            {isPlayerTurn(match, player.id) && <span className="ml-2 text-green-500">(Their turn)</span>}
          </div>
        </div>

        <div className="h-40 bg-gray-100 rounded-lg relative overflow-hidden p-4">
            <AnimatePresence>
            {showHit && (
                <motion.div
                initial={{ scale: 0, rotate: 0 }}
                animate={{ scale: 1, rotate: 360 }}
                exit={{ scale: 0, rotate: 0 }}
                className="absolute inset-0 bg-yellow-400 opacity-50"
                />
            )}
            </AnimatePresence>
            <p className="text-lg">
            {isPlayerTurn(match, player.id) 
                ? (playerArgument || "Your turn to argue!")
                : (opponentTyping || "Waiting for opponent's argument...")}
            </p>
            {!isPlayerTurn(match, player.id) && (
            <div className="mt-2 text-sm text-gray-500">
                <motion.div
                animate={{ opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                >
                Opponent is typing...
                </motion.div>
            </div>
            )}
        </div>

        <div className="space-y-4">
          <Input
            type="text"
            placeholder="Type your argument here..."
            value={playerArgument}
            onChange={handlePlayerTyping}
            disabled={!isPlayerTurn(match, player.id) || isSubmitting}
            className="w-full p-4 text-lg"
            aria-label="Argument input"
          />
          <Button 
            onClick={handleSubmit}
            disabled={!isPlayerTurn(match, player.id) || isSubmitting || playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH}
            className="w-full text-lg py-6 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 transition-all duration-300"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Argument'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<div>Loading match room...</div>}>
      <ArenaPageContent />
    </Suspense>
  );
}


