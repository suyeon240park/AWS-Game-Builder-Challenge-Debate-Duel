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

interface GameState {
  status: 'loading' | 'error' | 'success'
  message?: string
}

interface GameData {
  match: Schema['Match']['type'] | null
  player: Schema['Player']['type'] | null
  opponent: Schema['Player']['type'] | null
  roundNumber: number
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
    player: null,
    opponent: null,
    roundNumber: 1,
    timer: GAME_CONSTANTS.TURN_TIME,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerArgument, setPlayerArgument] = useState('')
  const [showHit, setShowHit] = useState(false)
  const [opponentTyping, setOpponentTyping] = useState('')

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const isPlayerTurn = useCallback((match: Schema['Match']['type'], playerId: string): boolean => {
    return (playerId === match.player1Id && match.currentTurn === 1) ||
           (playerId === match.player2Id && match.currentTurn === 2)
  }, [])

  const calculateScore = useCallback((argument: string): GameScore => {
    const wordCount = argument.split(' ').length
    const uniqueWords = new Set(argument.toLowerCase().split(' ')).size
    const avgWordLength = argument.length / wordCount

    return {
      clarity: Math.min(Math.floor(wordCount / 10), 10),
      evidence: Math.min(Math.floor(uniqueWords / wordCount * 10), 10),
      content: Math.min(Math.floor(avgWordLength), 10),
      get total() { return this.clarity + this.evidence + this.content }
    }
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

        console.log(players)

        const currentPlayer = players.find(p => p.id === currentPlayerId)
        const opponentPlayer = players.find(p => p.id !== currentPlayerId)

        if (currentPlayer) {
          console.log("current player: " + currentPlayer)
        }
        if (opponentPlayer) {
          console.log("opponent player: " + opponentPlayer)
        }

        if (!currentPlayer || !opponentPlayer) {
          throw new Error('Player identification failed')
        }

        const topic = getRandomTopic()
        await client.models.Match.update({
          id: matchId,
          topic,
          matchStatus: 'IN_PROGRESS'
        })

        setGameData({
          match: { ...matchData, topic },
          player: currentPlayer,
          opponent: opponentPlayer,
          roundNumber: 1,
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

  // Timer effect
  useEffect(() => {
    if (!gameData.match || !currentPlayerId || gameState.status !== 'success') return

    const timerInterval = setInterval(async () => {
      if (gameData.timer > 0) {
        setGameData(prev => ({ ...prev, timer: prev.timer - 1 }))
      } else if (isPlayerTurn(gameData.match!, currentPlayerId)) {
        await handleSubmit()
      }
    }, 1000)

    timerRef.current = timerInterval
    return () => clearInterval(timerInterval)
  }, [gameData.timer, currentPlayerId, gameData.match, gameState.status])

  // Handle turn end
  const handleTurnEnd = async () => {
    if (!matchId || !gameData.match) return

    setShowHit(true)
    setTimeout(() => setShowHit(false), GAME_CONSTANTS.HIT_ANIMATION_DURATION)

    try {
      const nextTurn = gameData.match.currentTurn === 1 ? 2 : 1
      const newRoundNumber = nextTurn === 1 ? gameData.roundNumber + 1 : gameData.roundNumber

      if (newRoundNumber > GAME_CONSTANTS.MAX_ROUNDS) {
        await client.models.Match.update({
          id: matchId,
          matchStatus: 'FINISHED'
        })
        router.push(`/result?matchId=${matchId}`)
      } else {
        await client.models.Match.update({
          id: matchId,
          currentTurn: nextTurn,
        })
        
        setGameData(prev => ({
          ...prev,
          roundNumber: newRoundNumber,
          timer: GAME_CONSTANTS.TURN_TIME
        }))
      }
    } catch (error) {
      console.error('Error updating turn:', error)
      toast.error('Failed to update turn')
    }
  }

  // Handle submit
  const handleSubmit = async () => {
    if (!matchId || !currentPlayerId || isSubmitting || 
        !isPlayerTurn(gameData.match!, currentPlayerId)) return

    if (playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH) {
      toast.error('Argument is too short')
      return
    }

    try {
      setIsSubmitting(true)
      const score = calculateScore(playerArgument)

      const updatedPlayer = await client.models.Player.update({
        id: currentPlayerId,
        argument: playerArgument,
        score: Math.min((gameData.player?.score ?? 0) + score.total, 100)
      })

      setGameData(prev => ({
        ...prev,
        player: updatedPlayer.data
      }))

      setPlayerArgument('')
      await handleTurnEnd()
    } catch (error) {
      console.error('Error submitting argument:', error)
      toast.error('Failed to submit argument')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle player typing
  const handlePlayerTyping = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!gameData.match || !currentPlayerId || !isPlayerTurn(gameData.match, currentPlayerId)) return
    
    const value = e.target.value
    setPlayerArgument(value)

    try {
      await client.models.Player.update({
        id: currentPlayerId,
        argument: value
      })
    } catch (error) {
      console.error('Error updating typing status:', error)
    }
  }, [gameData.match, currentPlayerId])

  // Subscriptions
  useEffect(() => {
    if (!matchId || !currentPlayerId || !gameData.match || gameState.status !== 'success') return

    const matchSub = client.models.Match.onUpdate({
      filter: { id: { eq: matchId } }
    }).subscribe(updatedMatch => {
      if (!updatedMatch) return
      setGameData(prev => ({
        ...prev,
        match: updatedMatch,
      }))
    })

    const playerSub = client.models.Player.onUpdate({
      filter: { id: { eq: gameData.opponent?.id } }
    }).subscribe(updatedPlayer => {
      if (!gameData.player || isPlayerTurn(gameData.match!, currentPlayerId)) return
      
      setOpponentTyping(updatedPlayer.argument || '')
      setGameData(prev => ({
        ...prev,
        opponent: updatedPlayer
      }))
    })

    return () => {
      matchSub.unsubscribe()
      playerSub?.unsubscribe()
    }
  }, [matchId, currentPlayerId, gameData.match, gameData.opponent?.id, gameState.status])

  if (gameState.status === 'loading') return <LoadingSpinner />
  if (gameState.status === 'error') return <ErrorMessage message={gameState.message || 'Unknown error'} />
  if (!gameData.match || !gameData.player || !gameData.opponent) {
    return <ErrorMessage message="Game data not found" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white/90 backdrop-blur-sm rounded-lg shadow-xl p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Round {gameData.roundNumber}/{GAME_CONSTANTS.MAX_ROUNDS}</h1>
            <p className="text-sm text-gray-500">Topic: {gameData.match.topic}</p>
          </div>
          <div className="text-3xl font-bold text-red-600 animate-pulse">{gameData.timer}s</div>
        </div>

        <ScoreDisplay 
          player={gameData.player.score ?? GAME_CONSTANTS.INITIAL_SCORE} 
          opponent={gameData.opponent.score ?? GAME_CONSTANTS.INITIAL_SCORE} 
        />

        <div className="flex justify-between items-center text-sm">
          <div>
            <span className="font-semibold">{gameData.player.nickname}</span>
            {currentPlayerId && isPlayerTurn(gameData.match, currentPlayerId) && (
              <span className="ml-2 text-green-500">(Your turn)</span>
            )}
          </div>
          <div>
            <span className="font-semibold">{gameData.opponent.nickname}</span>
            {currentPlayerId && !isPlayerTurn(gameData.match, currentPlayerId) && (
              <span className="ml-2 text-green-500">(Their turn)</span>
            )}
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
            {currentPlayerId && isPlayerTurn(gameData.match, currentPlayerId)
              ? (playerArgument || "Your turn to argue!")
              : (opponentTyping || "Waiting for opponent's argument...")}
          </p>
          
          {currentPlayerId && !isPlayerTurn(gameData.match, currentPlayerId) && opponentTyping && (
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
            disabled={currentPlayerId && !isPlayerTurn(gameData.match, currentPlayerId) || isSubmitting}
            className="w-full p-4 text-lg"
            aria-label="Argument input"
          />
          
          <Button 
            onClick={handleSubmit}
            disabled={
              currentPlayerId && !isPlayerTurn(gameData.match, currentPlayerId) || 
              isSubmitting || 
              playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH
            }
            className={`
              w-full text-lg py-6 
              bg-gradient-to-r from-blue-500 to-blue-700 
              hover:from-blue-600 hover:to-blue-800 
              transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white rounded-full border-t-transparent"
                />
                Submitting...
              </span>
            ) : (
              'Submit Argument'
            )}
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
