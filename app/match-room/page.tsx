'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { generateClient } from 'aws-amplify/api'
import { type Schema } from '@/amplify/data/resource'
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

// Initialize Amplify API client with schema type
const client = generateClient<Schema>()

// Define types from schema
type Match = Schema['Match']['type']
type Player = Schema['Player']['type']

const MatchRoomContent = () => {
  // Get matchId from URL query parameters
  const searchParams = useSearchParams()
  const router = useRouter()
  const matchId = searchParams.get('matchId')
  
  // State management for match data, player info, and UI states
  const [match, setMatch] = useState<Match | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Redirect to home if no matchId is provided
    if (!matchId) {
      router.push('/')
      return
    }

    const initializeMatch = async () => {
      try {
        // Fetch match details using matchId
        const { data: matches } = await client.models.Match.list({
          filter: { id: { eq: matchId } }
        })

        if (matches.length === 0) {
          throw new Error('Match not found')
        }

        const matchData = matches[0]
        setMatch(matchData)

        // Fetch players in the match
        const { data: players } = await client.models.Player.list({
          filter: {
            or: [
              { id: { eq: matchData.player1Id } },
              ...(matchData.player2Id ? [{ id: { eq: matchData.player2Id } }] : []),
            ]
          }
        })

        const currentPlayer = players.find(p => 
          p.id === matchData.player1Id || p.id === matchData.player2Id
        )

        if (currentPlayer) {
          setPlayer(currentPlayer)
        }

        setLoading(false)
      } catch (error) {
        console.error('Error initializing match:', error)
        setLoading(false)
        router.push('/')
      }
    }

    initializeMatch()

    // Set up real-time subscription for match updates
    const subscription = client.models.Match.observeQuery({
      filter: { id: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        if (items.length > 0) {
          const updatedMatch = items[0]
          setMatch(updatedMatch)

          // Redirect to area when both players are ready
          if (updatedMatch.player1Ready && updatedMatch.player2Ready) {
            router.push(`/arena/${updatedMatch.id}`)
          }
        }

        // Redirect to home if match is deleted
        else {
          router.push('/')
        }
      },
      error: (error) => {
        console.error('Subscription error:', error)
      }
    })

    // Cleanup subscription on component unmount
    return () => subscription.unsubscribe()
  }, [matchId, router])

  // Handle player ready state
  const handleReady = async () => {
    if (!match || !player) return

    try {
      
      const isPlayer1 = match.player1Id === player.id
      setIsReady(true)

      // Update ready status based on player position (1 or 2)
      await client.models.Match.update({
        id: match.id,
        ...(isPlayer1 
          ? { player1Ready: true }
          : { player2Ready: true }
        )
      })
    } catch (error) {
      console.error('Error updating ready status:', error)
      setIsReady(false)
    }
  }

  // Handle player leaving the match
  const handleLeave = async () => {
    if (!match || !player) return
  
    try {
      // Check whether the current palyer is player 1 or player 2
      const isPlayer1 = match.player1Id === player.id
  
      // If player1 leaves
      if (isPlayer1) {
        if (match.player2Id) {
          // Move player2 to player1's position
          await client.models.Match.update({
            id: match.id,
            player1Id: match.player2Id,
            player2Id: undefined,
            player1Ready: match.player2Ready,
            player2Ready: false,
            matchStatus: 'WAITING'
          })
        } else {
          // If no player2, delete the match
          await client.models.Match.delete({ id: match.id })
        }
        
        // Delete player1 (current player)
        await client.models.Player.delete({ id: player.id })
      }
      // If player2 leaves
      else {
        // Reset player2 fields in match
        await client.models.Match.update({
          id: match.id,
          player2Id: undefined,
          player2Ready: false,
          matchStatus: 'WAITING'
        })
        
        // Delete player2 (current player)
        await client.models.Player.delete({ id: player.id })
      }
  
      router.push('/')
    } catch (error) {
      console.error('Error leaving match:', error)
    }
  }
  
  // Loading state UI
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading match room...</div>
      </div>
    )
  }

  if (!match || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Error loading match room</div>
      </div>
    )
  }

  const PlayerStatus = ({ name, ready }: { name: string; ready: boolean }) => (
    <div className="text-center">
      <p className="text-lg font-semibold">{name}</p>
      <p className={`text-sm ${ready ? 'text-green-600' : 'text-red-600'}`}>
        {ready ? 'Ready' : 'Not Ready'}
      </p>
    </div>
  )

  const matchState = match?.player1Ready && match?.player2Ready ? 'ready' : match?.player2Id ? 'found' : 'waiting'
  const playerNickname = player?.nickname
  const isPlayer1 = match?.player1Id === player?.id
  const opponentReady = isPlayer1 ? match?.player2Ready : match?.player1Ready
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8 space-y-8">
        <h1 className="text-4xl font-serif font-bold text-gray-800 text-center">Match Room</h1>

        {matchState === 'waiting' && (
          <div className="text-center space-y-4">
            <Loader2 className="animate-spin h-12 w-12 mx-auto text-gray-600" />
            <p className="text-xl text-gray-700">Waiting for an opponent...</p>
          </div>
        )}

        {matchState === 'found' && (
          <div className="space-y-6">
            <p className="text-xl text-gray-700 text-center">Opponent found! Are you ready to duel?</p>
            <div className="flex justify-around items-center">
              <PlayerStatus name={playerNickname} ready={isReady} />
              <span className="text-2xl font-bold text-gray-600">VS</span>
              <PlayerStatus name="Opponent" ready={!!opponentReady} />
            </div>
            <Button 
              className="w-full text-lg py-6" 
              size="lg" 
              onClick={handleReady}
              disabled={isReady}
            >
              {isReady ? "Waiting for opponent..." : "I'm Ready!"}
            </Button>
          </div>
        )}

        {matchState === 'ready' && (
          <div className="text-center space-y-4">
            <p className="text-2xl text-green-600 font-bold">Both players are ready!</p>
            <p className="text-xl text-gray-700">Preparing the debate arena...</p>
            <Loader2 className="animate-spin h-12 w-12 mx-auto text-gray-600" />
          </div>
        )}
        <Button className="mt-4 w-full text-lg py-4 bg-red-500 text-white" onClick={handleLeave}>
          Leave Match
        </Button>
      </div>
    </div>
  )
}

export default function MatchRoom() {
  return (
    <Suspense fallback={<div>Loading match room...</div>}>
      <MatchRoomContent />
    </Suspense>
  )
}
