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
  isPlayer1: boolean
  roundNumber: number
  currentTurn: number
  timer: number
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

  const [gameState, setGameState] = useState<GameState>({ status: 'loading' })
  const [gameData, setGameData] = useState<GameData>({
    match: null,
    topic: null,
    player: null,
    opponent: null,
    isPlayer1: true,
    roundNumber: 1,
    currentTurn: 1,
    timer: GAME_CONSTANTS.TURN_TIME,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerArgument, setPlayerArgument] = useState('')
  const [showHit, setShowHit] = useState(false)
  const [opponentTyping, setOpponentTyping] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const lastTypingUpdate = useRef<number>(0)

  const isPlayerTurn = useCallback((): boolean => {
    return (
      (gameData.isPlayer1 && gameData.currentTurn === 1) ||
      (!gameData.isPlayer1 && gameData.currentTurn === 2)
    );
  }, [gameData.isPlayer1, gameData.currentTurn]);

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

        const players = playersResponse.data
        if (!players || players.length !== 2) throw new Error('Players not found')

        const currentPlayer = players.find(p => p.id === currentPlayerId)
        const opponentPlayer = players.find(p => p.id !== currentPlayerId)

        if (!currentPlayer || !opponentPlayer) {
          throw new Error('Player identification failed')
        }

        setGameData({
          match: { ...matchData},
          topic: getRandomTopic(),
          player: currentPlayer,
          opponent: opponentPlayer,
          isPlayer1: currentPlayerId === matchData.player1Id,
          roundNumber: 1,
          currentTurn: 1,
          timer: GAME_CONSTANTS.TURN_TIME,
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
      
      // Only send typing status, not content
      client.models.Match.update({
        id: matchId!,
        typingPlayerId: currentPlayerId,
        isTyping: true
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
  }, [isTyping, currentPlayerId, matchId]);

  // Subscribe to match updates and typing status
  useEffect(() => {
    if (!matchId || gameState.status !== 'success') return;

    const sub = client.models.Match.observeQuery({
      filter: { id: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        const matchData = items[0];
        if (matchData?.typingPlayerId === gameData.opponent?.id) {
          setOpponentTyping(matchData.isTyping ? 'typing' : '');
        }
        if (matchData) {
          setGameData(prev => ({
            ...prev,
            match: matchData
          }));
        }
      },
      error: (error) => console.error('Subscription error:', error)
    });

    return () => sub.unsubscribe();
  }, [matchId, gameState.status, gameData.opponent?.id]);

  
// Timer effect
useEffect(() => {
  if (gameState.status !== 'success') return;

  const timer = setInterval(() => {
    setGameData(prev => {
      const newTimer = Math.max(0, prev.timer - 1);
      
      // When timer reaches 0
      if (newTimer === 0) {
        // If both players have played in this round
        if (prev.currentTurn === 2) {
          // Move to next round
          return {
            ...prev,
            timer: GAME_CONSTANTS.TURN_TIME,
            currentTurn: 1,
            roundNumber: prev.roundNumber + 1
          };
        } else {
          // Switch to opponent's turn
          return {
            ...prev,
            timer: GAME_CONSTANTS.TURN_TIME,
            currentTurn: 2
          };
        }
      }

      // Just update timer if not zero
      return {
        ...prev,
        timer: newTimer
      };
    });
  }, 1000);

  return () => clearInterval(timer);
}, [gameState.status]);

// You might also want to update handleSubmit to be consistent with this logic:
const handleSubmit = async () => {
  if (playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH) {
    toast.error('Argument too short!');
    return;
  }

  setIsSubmitting(true);
  try {
    // Calculate score and submit argument here
    const score = calculateScore(playerArgument);

    // Show hit animation
    setShowHit(true);
    setTimeout(() => setShowHit(false), GAME_CONSTANTS.HIT_ANIMATION_DURATION);
    
    // Get current player data to get existing score
    if (currentPlayerId && score) {
      const playerData = await client.models.Player.get({ id: currentPlayerId });
      const currentScore = playerData.data?.score || 0;
  
      // Update score and argument
      await client.models.Player.update({
        id: currentPlayerId,
        score: currentScore + score,
        argument: playerArgument
      })
    }

    // If Round 3 is done, end the game
    if (gameData.roundNumber === GAME_CONSTANTS.MAX_ROUNDS && gameData.currentTurn === 2) {
      router.push('/results?matchId=${matchId}&playerId=${currentPlayerId}')
      return
    }

    // If both players have played in this round
    if (gameData.currentTurn === 2) {
      // Move to next round
      setGameData(prev => ({
        ...prev,
        currentTurn: 1,
        roundNumber: prev.roundNumber + 1,
        timer: GAME_CONSTANTS.TURN_TIME
      }));
    } else {
      // Switch to opponent's turn
      setGameData(prev => ({
        ...prev,
        currentTurn: 2,
        timer: GAME_CONSTANTS.TURN_TIME
      }));
    }
    
    // Reset argument input
    setPlayerArgument('');
    
  } catch (error) {
    toast.error('Failed to submit argument');
  } finally {
    setIsSubmitting(false);
  }
};


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
            Round {gameData.roundNumber} - {gameData.topic}
          </h1>
          <ScoreDisplay 
            player={GAME_CONSTANTS.INITIAL_SCORE} 
            opponent={GAME_CONSTANTS.INITIAL_SCORE} 
          />
        </div>

        {/* Game Area */}
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <div className="mb-4 flex justify-between items-center">
            <span className="text-lg font-medium">
              {isPlayerTurn() ? "Your Turn" : "Opponent's Turn"}
            </span>
            <span className="text-lg font-medium">
              Time: {gameData.timer}s
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
            
            {/* Opponent Typing Indicator */}
            <AnimatePresence>
              {opponentTyping && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-sm text-gray-500 italic"
                >
                  Opponent is typing...
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hit Animation */}
            <AnimatePresence>
              {showHit && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center"
                >
                  <span className="text-4xl font-bold">HIT!</span>
                </motion.div>
              )}
            </AnimatePresence>

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
      </div>
    </div>
  )
}

// Main Arena Page Component
export default function ArenaPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ArenaPageContent />
    </Suspense>
  )
}
