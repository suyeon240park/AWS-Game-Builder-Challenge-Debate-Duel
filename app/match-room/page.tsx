"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Loader2 } from 'lucide-react'
import { generateClient } from 'aws-amplify/api'
import { type Schema } from '@/amplify/data/resource'

const client = generateClient<Schema>()

type MatchStatus = 'WAITING' | 'MATCHED' | 'READY' | 'FINISHED'

interface Match {
  id: string
  player1Id: string
  player2Id?: string
  player1Ready: boolean
  player2Ready: boolean
  matchStatus: MatchStatus
}

export default function MatchRoom() {
  const [match, setMatch] = useState<Match | null>(null)
  const [playerId] = useState(`player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
  const [isPlayer1, setIsPlayer1] = useState(false)
  
  useEffect(() => {
    joinOrCreateMatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const joinOrCreateMatch = async () => {
    try {
      const response = await client.graphql({
        query: 'joinMatch',
        variables: { playerId }
      })
      
      const { matchId, isPlayer1: isFirstPlayer, matchStatus } = response.data.joinMatch
      setIsPlayer1(isFirstPlayer)
      
      // Subscribe to match updates
      subscribeToMatch(matchId)
      
      // Get initial match data
      const matchData = await client.models.Match.get({ id: matchId })
      setMatch(matchData)
    } catch (error) {
      console.error('Error joining match:', error)
    }
  }

  const subscribeToMatch = (matchId: string) => {
    const subscription = client.graphql({
      query: `subscription OnMatchUpdate($matchId: String!) {
        onMatchUpdate(matchId: $matchId) {
          id
          player1Id
          player2Id
          player1Ready
          player2Ready
          matchStatus
        }
      }`,
      variables: { matchId }
    }).subscribe({
      next: ({ data }) => {
        setMatch(data.onMatchUpdate)
      },
      error: (error) => console.error('Subscription error:', error)
    })

    return () => subscription.unsubscribe()
  }

  const handleReady = async () => {
    if (!match) return

    try {
      await client.graphql({
        query: 'updatePlayerStatus',
        variables: {
          matchId: match.id,
          playerId: playerId,
          isReady: true
        }
      })
    } catch (error) {
      console.error('Error updating ready status:', error)
    }
  }

  const getPlayerStatus = () => {
    if (!match) return { playerReady: false, opponentReady: false }
    
    if (isPlayer1) {
      return {
        playerReady: match.player1Ready,
        opponentReady: match.player2Ready
      }
    } else {
      return {
        playerReady: match.player2Ready,
        opponentReady: match.player1Ready
      }
    }
  }

  const { playerReady, opponentReady } = getPlayerStatus()

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8 space-y-8">
        <h1 className="text-4xl font-serif font-bold text-gray-800 text-center">Match Room</h1>
        
        {!match || match.matchStatus === 'WAITING' ? (
          <div className="text-center space-y-4">
            <Loader2 className="animate-spin h-12 w-12 mx-auto text-gray-600" />
            <p className="text-xl text-gray-700">Waiting for an opponent...</p>
            <p className="text-sm text-gray-500">You are {isPlayer1 ? 'Player 1' : 'searching...'}</p>
          </div>
        ) : match.matchStatus === 'MATCHED' && (
          <div className="space-y-6">
            <p className="text-xl text-gray-700 text-center">
              Opponent found! Are you ready to duel?
            </p>
            <div className="flex justify-around items-center">
              <PlayerStatus 
                name={isPlayer1 ? "You (P1)" : "You (P2)"} 
                ready={playerReady} 
              />
              <span className="text-2xl font-bold text-gray-600">VS</span>
              <PlayerStatus 
                name={isPlayer1 ? "P2" : "P1"} 
                ready={opponentReady} 
              />
            </div>
            <Button 
              className="w-full text-lg py-6" 
              size="lg" 
              onClick={handleReady}
              disabled={playerReady}
            >
              {playerReady ? "Waiting for opponent..." : "I'm Ready!"}
            </Button>
          </div>
        )}

        {match?.matchStatus === 'READY' && (
          <div className="text-center space-y-4">
            <p className="text-2xl text-green-600 font-bold">Both players are ready!</p>
            <p className="text-xl text-gray-700">Preparing the debate arena...</p>
            <Loader2 className="animate-spin h-12 w-12 mx-auto text-gray-600" />
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerStatus({ name, ready }: { name: string, ready: boolean }) {
  return (
    <div className="text-center space-y-2">
      <div className={`w-16 h-16 rounded-full border-4 ${ready ? 'border-green-500 bg-green-100' : 'border-gray-300 bg-gray-100'} flex items-center justify-center mx-auto`}>
        <span className="text-2xl">{name[0]}</span>
      </div>
      <p className="text-lg font-semibold text-gray-700">{name}</p>
      <p className={`text-sm ${ready ? 'text-green-600' : 'text-gray-500'}`}>
        {ready ? 'Ready!' : 'Not ready'}
      </p>
    </div>
  )
}
