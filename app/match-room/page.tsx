'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { generateClient } from 'aws-amplify/api'
import { type Schema } from '@/amplify/data/resource'
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

const client = generateClient<Schema>()

type Match = Schema['Match']['type']
type Player = Schema['Player']['type']

export default function MatchRoom() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const matchId = searchParams.get('matchId')
  
  const [match, setMatch] = useState<Match | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!matchId) {
      router.push('/')
      return
    }

    const initializeMatch = async () => {
      try {
        const { data: matches } = await client.models.Match.list({
          filter: { matchId: { eq: matchId } },
        })

        if (matches.length === 0) throw new Error('Match not found')
        const matchData = matches[0]
        setMatch(matchData)

        const { data: players } = await client.models.Player.list({
          filter: {
            or: [
              { playerId: { eq: matchData.player1Id } },
              ...(matchData.player2Id ? [{ playerId: { eq: matchData.player2Id } }] : []),
            ],
          },
        })

        const currentPlayer = players.find(
          (p) => p.playerId === matchData.player1Id || p.playerId === matchData.player2Id
        )
        setPlayer(currentPlayer || null)

        setLoading(false)
      } catch (error) {
        console.error('Error initializing match:', error)
        setLoading(false)
        router.push('/')
      }
    }

    initializeMatch()

    const subscription = client.models.Match.observeQuery({
      filter: { matchId: { eq: matchId } },
    }).subscribe({
      next: ({ items }) => {
        if (items.length > 0) {
          const updatedMatch = items[0]
          setMatch(updatedMatch)

          if (updatedMatch.player1Ready && updatedMatch.player2Ready) {
            router.push(`/arena/${updatedMatch.matchId}`)
          }
        } else {
          router.push('/')
        }
      },
      error: (error) => console.error('Subscription error:', error),
    })

    return () => subscription.unsubscribe()
  }, [matchId, router])

  const handleReady = async () => {
    if (!match || !player) return

    try {
      const isPlayer1 = match.player1Id === player.playerId
      setIsReady(true)

      await client.models.Match.update({
        id: match.id,
        ...(isPlayer1
          ? { player1Ready: true }
          : { player2Ready: true }),
      })
    } catch (error) {
      console.error('Error updating ready status:', error)
      setIsReady(false)
    }
  }

  const handleLeave = async () => {
    if (!match || !player) return

    try {
      const isPlayer1 = match.player1Id === player.playerId

      if (isPlayer1) {
        await client.models.Match.delete({ id: match.id })
      } else {
        await client.models.Match.update({
          id: match.id,
          player2Id: undefined,
          player2Ready: false,
          matchStatus: 'WAITING',
        })
      }

      await client.models.Player.update({
        id: player.id,
        currentMatchId: undefined,
      })

      router.push('/')
    } catch (error) {
      console.error('Error leaving match:', error)
    }
  }

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8 space-y-8">
        <h1 className="text-4xl font-serif font-bold text-gray-800 text-center">Match Room</h1>
        {/* Additional UI and conditional rendering */}
        <Button className="mt-4 w-full text-lg py-4 bg-red-500 text-white" onClick={handleLeave}>
          Leave Match
        </Button>
      </div>
    </div>
  )
}
