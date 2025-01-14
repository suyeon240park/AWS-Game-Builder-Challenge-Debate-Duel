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
  TURN_TIME: 30 as number,
  TYPING_THROTTLE: 1000,
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
interface GameState {
  status: 'loading' | 'error' | 'success'
  message?: string
}

interface GameData {
  match: Schema['Match']['type'] | null
  topic: string | null
  player: Schema['Player']['type'] | null
  opponent: Schema['Player']['type'] | null
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

const getRandomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)]

const client = generateClient<Schema>()

const ArenaPageContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const matchId = searchParams.get('matchId')
  const currentPlayerId = searchParams.get('playerId')
  const prevTurnRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameState>({ status: 'loading' })
  const [gameData, setGameData] = useState<GameData>({
    match: null,
    topic: null,
    player: null,
    opponent: null
  })

  const [timer, setTimer] = useState<number>(GAME_CONSTANTS.TURN_TIME)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerArgument, setPlayerArgument] = useState('')
  const [showHit, setShowHit] = useState(false)
  const [opponentTyping, setOpponentTyping] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const lastTypingUpdate = useRef<number>(0)

  const isPlayerTurn = useCallback((): boolean => {
    if (!gameData.match) return false;
    const isPlayer1 = gameData.player?.id === gameData.match.player1Id;
    return (
      (isPlayer1 && gameData.match.currentTurn === 1) ||
      (!isPlayer1 && gameData.match.currentTurn === 2)
    );
  }, [gameData.match?.currentTurn, gameData.player?.id, gameData.match?.player1Id]);

  const calculateScore = useCallback((argument: string): number => {
    const wordCount = argument.split(' ').length
    const uniqueWords = new Set(argument.toLowerCase().split(' ')).size
    const avgWordLength = argument.length / wordCount

    const clarity = Math.min(Math.floor(wordCount / 10), 10)
    const evidence = Math.min(Math.floor(uniqueWords / wordCount * 10), 10)
    const content = Math.min(Math.floor(avgWordLength), 10)

    return clarity + evidence + content
  }, [])

  // Initialize game
  useEffect(() => {
    if (!matchId || !currentPlayerId) {
      router.push('/')
      return
    }

    const initializeGame = async () => {
      try {
        setGameState({ status: 'loading' })

        const [matchResponse, playersResponse] = await Promise.all([
          client.models.Match.get({ id: matchId }),
          client.models.Player.list({
            filter: { currentMatchId: { eq: matchId } }
          })
        ])

        const matchData = matchResponse.data
        if (!matchData) throw new Error('Match not found')

        // Initialize or update match with round/turn data if not exists
        if (!matchData.roundNumber || !matchData.currentTurn) {
          await client.models.Match.update({
            id: matchId,
            roundNumber: 1,
            currentTurn: 1,
            timer: GAME_CONSTANTS.TURN_TIME
          });
        }

        const players = playersResponse.data
        if (!players || players.length !== 2) throw new Error('Players not found')

        const currentPlayer = players.find(p => p.id === currentPlayerId)
        const opponentPlayer = players.find(p => p.id !== currentPlayerId)

        if (!currentPlayer || !opponentPlayer) {
          throw new Error('Player identification failed')
        }

        setGameData({
          match: { ...matchData },
          topic: getRandomTopic(),
          player: currentPlayer,
          opponent: opponentPlayer
        })

        setGameState({ status: 'success' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize game'
        setGameState({ status: 'error', message })
        toast.error(message)
      }
    }

    initializeGame()
  }, [matchId, currentPlayerId, router])

  // Handle player typing with throttling
  const handlePlayerTyping = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPlayerArgument(value);
    
    const now = Date.now();
    if (!isTyping || now - lastTypingUpdate.current > GAME_CONSTANTS.TYPING_THROTTLE) {
      setIsTyping(true);
      lastTypingUpdate.current = now;
      
      // Update match with current argument
      client.models.Match.update({
        id: matchId!,
        typingPlayerId: currentPlayerId,
        isTyping: true,
        [gameData.player?.id === gameData.match?.player1Id ? 'player1Argument' : 'player2Argument']: value
      }).catch(error => {
        console.warn('Typing sync failed:', error);
      });

      // Auto-clear typing status after delay
      setTimeout(() => {
        setIsTyping(false);
        client.models.Match.update({
          id: matchId!,
          typingPlayerId: currentPlayerId,
          isTyping: false
        }).catch(error => {
          console.warn('Typing clear failed:', error);
        });
      }, GAME_CONSTANTS.TYPING_THROTTLE + 500);
    }
  }, [isTyping, currentPlayerId, matchId, gameData.player?.id, gameData.match?.player1Id]);

  
// Update subscription effect
useEffect(() => {
  if (!matchId || gameState.status !== 'success') return;

  const sub = client.models.Match.observeQuery({
    filter: { id: { eq: matchId } }
  }).subscribe({
    next: ({ items }) => {
      const matchData = items[0];
      if (matchData) {
        // Subscribe to player scores
        setGameData(prev => ({
          ...prev,
          player: gameData.player,
          opponent: gameData.opponent
        }));

        // Check if game is FINISHED
        if (matchData.matchStatus === 'FINISHED') {
          handleGameEnd();
          return;
        }

        // Reset timer when turn changes
        if (matchData.currentTurn !== prevTurnRef.current) {
          setTimer(GAME_CONSTANTS.TURN_TIME);
        }
        
        // Update previous turn reference
        prevTurnRef.current = matchData.currentTurn;
        
        // Update opponent's argument in real-time
        const isPlayer1 = gameData.player?.id === matchData.player1Id;
        const opponentArgument = isPlayer1 ? matchData.player2Argument : matchData.player1Argument;
        
        setOpponentTyping(opponentArgument || '');
        
        setGameData(prev => ({
          ...prev,
          match: matchData
        }));
      }
    },
    error: (error) => console.error('Subscription error:', error)
  });

  return () => sub.unsubscribe();
}, [matchId, gameState.status, gameData.player?.id]);


  // Timer effect
  useEffect(() => {
    if (gameState.status !== 'success') return;

    const timerInterval = setInterval(async () => {
      // Check match status first
      try {
        const matchResponse = await client.models.Match.get({ id: matchId! });
        const matchData = matchResponse.data;
        
        if (matchData?.matchStatus === 'FINISHED') {
          handleGameEnd();
          return;
        }
      } catch (error) {
        console.error('Failed to check match status:', error);
      }

      setTimer(prev => {
        const newTimer = Math.max(0, prev - 1);
        
        if (newTimer === 0) {
          const matchData = gameData.match;
          if (!matchData) return prev;

          // Check for game end
          if (matchData.roundNumber === GAME_CONSTANTS.MAX_ROUNDS && matchData.currentTurn === 2) {
            handleGameEnd()
            return GAME_CONSTANTS.TURN_TIME;
          }

          // Update match in DB when timer expires
          client.models.Match.update({
            id: matchId!,
            currentTurn: matchData.currentTurn === 1 ? 2 : 1,
            roundNumber: matchData.currentTurn === 2 ? matchData.roundNumber + 1 : matchData.roundNumber,
            timer: GAME_CONSTANTS.TURN_TIME,
            player1Argument: null,
            player2Argument: null
          }).catch(console.error);

          return GAME_CONSTANTS.TURN_TIME;
        }

        return newTimer;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [gameState.status, matchId, currentPlayerId, router, gameData.match]);


  const handleSubmit = async () => {
    if (playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH) {
      toast.error('Argument too short!');
      return;
    }

    setIsSubmitting(true);
    try {
      //const score = calculateScore(playerArgument);
      const score = 10

      // Show hit animation
      setShowHit(true);
      setTimeout(() => setShowHit(false), GAME_CONSTANTS.HIT_ANIMATION_DURATION);

      // Get current player data to get existing score
      if (currentPlayerId && score) {
        const playerData = await client.models.Player.get({ id: currentPlayerId });
        const currentScore = playerData.data?.score || 0;
        console.log(currentScore)
    
        // Update score and argument
        await client.models.Player.update({
          id: currentPlayerId,
          score: currentScore + score
        });
      }

      const matchData = gameData.match;
      if (!matchData) return;

      // If Round 3 is done, end the game
      if (matchData.roundNumber === GAME_CONSTANTS.MAX_ROUNDS && matchData.currentTurn === 2) {
        handleGameEnd()
      }

      // Update match with new turn/round and reset argument
      await client.models.Match.update({
        id: matchId!,
        currentTurn: matchData.currentTurn === 1 ? 2 : 1,
        roundNumber: matchData.currentTurn === 2 ? matchData.roundNumber + 1 : matchData.roundNumber,
        timer: GAME_CONSTANTS.TURN_TIME,
        player1Argument: null,
        player2Argument: null
      });

      setPlayerArgument('');
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit argument'
      toast.error(message)
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGameEnd = useCallback(async () => {
    if (!matchId || !currentPlayerId) return;
  
    try {
      // Update match status to FINISHED
      await client.models.Match.update({
        id: matchId,
        matchStatus: 'FINISHED'
      });
  
      // Redirect to result page
      router.push(`/result?matchId=${matchId}&playerId=${currentPlayerId}`);
    } catch (error) {
      const message = error instanceof Error ? 
        error.message : 
        'Failed to end game properly';
      toast.error(message);
      console.error('Game end error:', error);
    }
  }, [matchId, currentPlayerId, router]);
  

  if (gameState.status === 'loading') {
    return <LoadingSpinner />
  }

  if (gameState.status === 'error') {
    return <ErrorMessage message={gameState.message || 'Unknown error'} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Round {gameData.match?.roundNumber} - {gameData.topic}
          </h1>
          <ScoreDisplay 
            player={gameData.player?.score || 0}
            opponent={gameData.opponent?.score || 0}
          />
        </div>

        {/* Game Area */}
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <div className="mb-4 flex justify-between items-center">
            <span className="text-lg font-medium">
              {isPlayerTurn() ? "Your Turn" : "Opponent's Turn"}
            </span>
            <span className="text-lg font-medium">
              Time: {timer}s
            </span>
          </div>

          {/* Argument Input */}
          <div className="space-y-4">
            <Input
              placeholder={isPlayerTurn() ? "Type your argument..." : "Waiting for opponent..."}
              value={playerArgument}
              onChange={handlePlayerTyping}
              disabled={!isPlayerTurn() || isSubmitting}
              className="w-full p-3"
            />
            
            {/* Opponent's Argument Display */}
            {opponentTyping && !isPlayerTurn() && (
              <div className="p-3 bg-gray-100 rounded">
                {opponentTyping}
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!isPlayerTurn() || isSubmitting || playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH}
              className="w-full"
            >
              {isSubmitting ? "Submitting..." : "Submit Argument"}
            </Button>
          </div>
        </div>

        {/* Hit Animation */}
        <AnimatePresence>
          {showHit && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-6xl font-bold text-red-500">HIT!</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ArenaPageContent />
    </Suspense>
  )
}
