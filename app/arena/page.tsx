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
  const matchId = searchParams.get('matchId')

  // Game State
  const [match, setMatch] = useState<Schema['Match']['type'] | null>(null)
  const [gameState, setGameState] = useState<Schema['GameState']['type'] | null>(null)
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
  const [currentTurn, setCurrentTurn] = useState<'player' | 'opponent'>('player')
  const [roundNumber, setRoundNumber] = useState(1)
  const [showHit, setShowHit] = useState(false)
  const [playerTyping, setPlayerTyping] = useState('')
  const [opponentTyping, setOpponentTyping] = useState('')

  // Refs
  const playerTypingRef = useRef<NodeJS.Timeout | null>(null)

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
        console.log(currentPlayer)
        console.log(opponentPlayer)
        if (!currentPlayer || !opponentPlayer) throw new Error('Players not found')
        
        setPlayer(currentPlayer)
        setOpponent(opponentPlayer)
        setPlayerScore(currentPlayer.score ?? GAME_CONSTANTS.INITIAL_SCORE)
        setOpponentScore(opponentPlayer.score ?? GAME_CONSTANTS.INITIAL_SCORE)

        // Get or create game state
        const { data: existingGameState } = await client.models.GameState.list({
          filter: { id: { eq: matchId } }
        })

        if (existingGameState.length === 0) {
          const { data: newGameState } = await client.models.GameState.create({
            id: matchId,
            topic: TOPICS[Math.floor(Math.random() * TOPICS.length)],
            currentTurn: 1,
            roundNumber: 1,
            timeRemaining: GAME_CONSTANTS.TURN_TIME
          })
          setGameState(newGameState)
        } else {
          setGameState(existingGameState[0])
        }
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

  // Turn end handler
  const handleTurnEnd = async () => {
    if (!gameState?.id || !matchId) return

    setShowHit(true)
    setTimeout(async () => {
        setShowHit(false)
        
        try {
        if (currentTurn === 'player') {
            handleOpponentTurn()
        } else {
            setCurrentTurn('player')
            if ((gameState.roundNumber ?? 1) >= GAME_CONSTANTS.MAX_ROUNDS) {
            await client.models.Match.update({
                id: matchId,
                matchStatus: 'FINISHED'
            })
            router.push(`/result?matchId=${matchId}`)
            } else {
            await client.models.GameState.update({
                id: gameState.id,
                roundNumber: (gameState.roundNumber ?? 1) + 1,
                timeRemaining: GAME_CONSTANTS.TURN_TIME
            })
            }
        }
        } catch (error) {
        console.error('Error handling turn end:', error)
        toast.error('Failed to process turn end')
        }
    }, GAME_CONSTANTS.HIT_ANIMATION_DURATION)
  }

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

  // Function to display opponent's argument with typing animation
  const displayOpponentArgument = useCallback((fullArgument: string) => {
    let currentIndex = 0
  
    const typingInterval = setInterval(() => {
      if (currentIndex < fullArgument.length) {
        setOpponentTyping(fullArgument.slice(0, currentIndex + 1))
        currentIndex++
      } else {
        clearInterval(typingInterval)
        setTimeout(() => {
          const score = calculateScore(fullArgument)
          setOpponentScore(prev => Math.min(prev + score.total, 100))
          setPlayerScore(prev => Math.max(prev - score.total, 0))
          setOpponentTyping('')
          handleTurnEnd()
        }, 1000)
      }
    }, 100)
  }, [calculateScore, handleTurnEnd])

  // Timer effect
  useEffect(() => {
    if (!gameState?.id || !match) return

    const interval = setInterval(async () => {
      try {
        const currentTime = gameState.timeRemaining ?? GAME_CONSTANTS.TURN_TIME
        if (currentTime > 0) {
          await client.models.GameState.update({
            id: gameState.id,
            timeRemaining: currentTime - 1
          })
        } else {
          handleTurnEnd()
        }
      } catch (error) {
        console.error('Error updating timer:', error)
        toast.error('Failed to update game timer')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [gameState?.id, match, gameState?.timeRemaining, handleTurnEnd])

  // Game state subscription
  useEffect(() => {
    if (!matchId) return

    const subscription = client.models.GameState.observeQuery({
      filter: { id: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        if (items.length > 0) {
          setGameState(items[0])
          setTimer(items[0].timeRemaining ?? GAME_CONSTANTS.TURN_TIME)
          setRoundNumber(items[0].roundNumber ?? 1)
        }
      },
      error: (error) => {
        console.error('Subscription error:', error)
        toast.error('Lost connection to game. Please refresh.')
      }
    })

    return () => subscription.unsubscribe()
  }, [matchId])

  // Subscription for opponent arguments
  useEffect(() => {
    if (!matchId || !opponent) return
  
    const subscription = client.models.Player.observeQuery({
      filter: { 
        id: { eq: opponent.id },
        currentMatchId: { eq: matchId }
      }
    }).subscribe({
      next: ({ items }) => {
        if (items.length > 0 && items[0].argument) {
          displayOpponentArgument(items[0].argument)
        }
      },
      error: (error) => {
        console.error('Error in opponent subscription:', error)
        toast.error('Lost connection to opponent')
      }
    })
  
    return () => subscription.unsubscribe()
  }, [matchId, opponent?.id, displayOpponentArgument, opponent])

  // Typing handlers
  const handlePlayerTyping = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setPlayerArgument(value)
    setPlayerTyping(value)
    
    if (playerTypingRef.current) {
      clearTimeout(playerTypingRef.current)
    }
    
    playerTypingRef.current = setTimeout(() => {
      setPlayerTyping('')
    }, GAME_CONSTANTS.TYPING_TIMEOUT)
  }, [])

  const handleOpponentTurn = useCallback(() => {
    setCurrentTurn('opponent')
    // The opponent's input will be handled by the subscription
    // We just need to show that we're waiting for their input
    setOpponentTyping('Opponent is typing...')
  }, [])

  // Submit handler
  const handleSubmit = async () => {
    if (!gameState?.id || !player || !matchId || isSubmitting) return
    if (playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH) {
      toast.error('Argument is too short')
      return
    }

    try {
      setIsSubmitting(true)
      const score = calculateScore(playerArgument)
      
      // Update player's argument and score
      await client.models.Player.update({
        id: player.id,
        argument: playerArgument,
        score: Math.min((player.score ?? 0) + score.total, 100)
      })

      // Update game state
      await client.models.GameState.update({
        id: gameState.id,
        currentTurn: gameState.currentTurn === 1 ? 2 : 1,
        timeRemaining: GAME_CONSTANTS.TURN_TIME
      })

      setPlayerArgument('')
      setPlayerTyping('')
      handleTurnEnd()
      
    } catch (error) {
      console.error('Error submitting argument:', error)
      toast.error('Failed to submit argument')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!gameState || !match || !player || !opponent) return <ErrorMessage message="Game data not found" />

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Round {roundNumber}/{GAME_CONSTANTS.MAX_ROUNDS}</h1>
            <p className="text-sm text-gray-500">Topic: {gameState.topic}</p>
          </div>
          <div className="text-3xl font-bold text-red-600 animate-pulse">{timer}s</div>
        </div>

        <ScoreDisplay player={playerScore} opponent={opponentScore} />

        <div className="flex justify-between items-center text-sm">
          <div>
            <span className="font-semibold">{player.nickname}</span>
            {currentTurn === 'player' && <span className="ml-2 text-green-500">(Your turn)</span>}
          </div>
          <div>
            <span className="font-semibold">{opponent.nickname}</span>
            {currentTurn === 'opponent' && <span className="ml-2 text-green-500">(Their turn)</span>}
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
            {currentTurn === 'player' 
                ? (playerTyping || "Your turn to argue!")
                : (opponentTyping || "Waiting for opponent's argument...")}
            </p>
            {currentTurn === 'opponent' && (
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
            disabled={currentTurn !== 'player' || isSubmitting}
            className="w-full p-4 text-lg"
            aria-label="Argument input"
          />
          <Button 
            onClick={handleSubmit}
            disabled={currentTurn !== 'player' || isSubmitting || playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH}
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


