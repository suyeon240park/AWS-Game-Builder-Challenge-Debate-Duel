'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useParams, useRouter } from 'next/navigation'
import { generateClient } from 'aws-amplify/api'
import { type Schema } from '@/amplify/data/resource'

const client = generateClient<Schema>()

const TOPICS = [
  "Should artificial intelligence be regulated?",
  "Is social media doing more harm than good?",
  "Should voting be mandatory?",
  "Should college education be free?",
  "Is space exploration worth the cost?",
]

export default function ArenaPage() {
  const router = useRouter()
  const params = useParams()
  const matchId = params.matchId as string

  const [match, setMatch] = useState<Schema['Match']['type'] | null>(null)
  const [gameState, setGameState] = useState<Schema['GameState']['type'] | null>(null)
  const [player, setPlayer] = useState<Schema['Player']['type'] | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)

  // Initialize match and game state
  useEffect(() => {
    const initializeArena = async () => {
      try {
        // Get match data
        const { data: matches } = await client.models.Match.list({
          filter: { id: { eq: matchId } },
        })

        if (matches.length === 0) {
          throw new Error('Match not found')
        }

        const matchData = matches[0]
        setMatch(matchData)

        // Get current player data
        const { data: players } = await client.models.Player.list({
          filter: { currentMatchId: { eq: matchId } }
        })
        const currentPlayer = players.find(p => 
          p.id === matchData.player1Id || p.id === matchData.player2Id
        )
        if (currentPlayer) {
          setPlayer(currentPlayer)
        }

        // Check for existing game state or create new one
        const { data: gameStates } = await client.models.GameState.list({
          filter: { matchId: { eq: matchId } },
        })

        if (gameStates.length === 0) {
          // Create new game state
          const randomTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)]
          const { data: newGameState } = await client.models.GameState.create({
            matchId,
            currentTurn: matchData.player1Id,
            topic: randomTopic,
            phase: 'topic',
            timeRemaining: 5,
            player1Score: 50,
            player2Score: 50,
            roundNumber: 1,
            player1Argument: '',
            player2Argument: ''
          })

          // Update match status
          await client.models.Match.update({
            id: matchId,
            matchStatus: 'IN_PROGRESS'
          })

          setGameState(newGameState)
        } else {
          setGameState(gameStates[0])
        }

        setLoading(false)
      } catch (error) {
        console.error('Error initializing arena:', error)
        router.push('/')
      }
    }

    initializeArena()
  }, [matchId, router])

  // Subscribe to game state changes
  useEffect(() => {
    if (!matchId) return

    const subscription = client.models.GameState.observeQuery({
      filter: { matchId: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        if (items.length > 0) {
          setGameState(items[0])
        }
      },
      error: (error) => console.error('Subscription error:', error)
    })

    return () => subscription.unsubscribe()
  }, [matchId])

  useEffect(() => {
    if (!gameState?.id || !match) return

    const interval = setInterval(async () => {
      try {
        const currentTime = gameState.timeRemaining ?? 0
        if (currentTime > 0) {
          await client.models.GameState.update({
            id: gameState.id,
            timeRemaining: currentTime - 1,
          })
        } else {
          // Handle phase transitions
          if (gameState.phase === 'topic') {
            await client.models.GameState.update({
              id: gameState.id,
              phase: 'debate',
              timeRemaining: 30,
            })
          } else if (gameState.phase === 'debate') {
            const currentRound = gameState.roundNumber ?? 1
            if (currentRound >= 3) {
              // Update match status to finished
              await client.models.Match.update({
                id: matchId,
                matchStatus: 'FINISHED'
              })
              router.push(`/result/${matchId}`)
            } else {
              await client.models.GameState.update({
                id: gameState.id,
                roundNumber: currentRound + 1,
                currentTurn: gameState.currentTurn === match.player1Id ? match.player2Id : match.player1Id,
                timeRemaining: 30,
                player1Argument: '',
                player2Argument: '',
              })
            }
          }
        }
      } catch (error) {
        console.error('Error updating game state:', error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [gameState?.id, match, matchId, router])

  const handleSubmit = async () => {
    if (!gameState?.id || !match || !player || input.trim() === '') return

    try {
      const isPlayer1 = match.player1Id === player.id
      await client.models.GameState.update({
        id: gameState.id,
        [isPlayer1 ? 'player1Argument' : 'player2Argument']: input,
        currentTurn: isPlayer1 ? match.player2Id : match.player1Id,
        timeRemaining: 30
      })

      setInput('')
    } catch (error) {
      console.error('Error submitting argument:', error)
    }
  }

  if (loading || !gameState || !match || !player) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex items-center justify-center">
        <div className="text-2xl font-bold text-gray-700">Loading arena...</div>
      </div>
    )
  }

  const isPlayer1 = match.player1Id === player.id
  const isMyTurn = gameState.currentTurn === player.id
  const currentRound = gameState.roundNumber ?? 1
  const timeRemaining = gameState.timeRemaining ?? 0
  const player1Score = gameState.player1Score ?? 0
  const player2Score = gameState.player2Score ?? 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-xl p-8 space-y-6">
        <div className="flex justify-between items-center">
          <Progress value={player1Score} className="w-1/3" />
          <div className="text-2xl font-bold">Round {currentRound}/3</div>
          <Progress value={player2Score} className="w-1/3" />
        </div>

        {gameState.phase === 'topic' && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">Topic</h2>
            <p className="text-xl">{gameState.topic}</p>
            <p>Starting in {timeRemaining} seconds...</p>
          </div>
        )}

        {gameState.phase === 'debate' && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Time Remaining: {timeRemaining}s</h2>
              <p className="text-lg">{isMyTurn ? "Your turn!" : "Opponent's turn..."}</p>
            </div>

            <div className="space-y-2">
              <div className="bg-gray-100 p-4 rounded min-h-[100px]">
                <h3 className="font-semibold mb-2">Your Argument:</h3>
                {isPlayer1 ? (gameState.player1Argument ?? '') : (gameState.player2Argument ?? '')}
              </div>
              <div className="bg-gray-100 p-4 rounded min-h-[100px]">
                <h3 className="font-semibold mb-2">Opponent's Argument:</h3>
                {isPlayer1 ? (gameState.player2Argument ?? '') : (gameState.player1Argument ?? '')}
              </div>
            </div>

            {isMyTurn && (
              <div className="flex space-x-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your argument..."
                  disabled={!isMyTurn}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSubmit}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Submit
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}