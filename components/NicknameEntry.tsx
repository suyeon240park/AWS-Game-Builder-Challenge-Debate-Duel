'use client'

import { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useRouter } from 'next/navigation'
import { generateClient } from 'aws-amplify/api'
import { type Schema } from '@/amplify/data/resource'

const client = generateClient<Schema>()

interface NicknameEntryProps {
  onClose: () => void;
}

export default function NicknameEntry({ onClose }: NicknameEntryProps) {
  const [nickname, setNickname] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    setIsLoading(true)
    try {
      // Create a new player
      const playerId = `player_${Date.now().toString(36)}`
      console.log(playerId)
      
      await client.models.Player.create({
        id: playerId,
        nickname: nickname.trim()
      })

      // Check for existing WAITING matches
      const { data: waitingMatches } = await client.models.Match.list({
        filter: {
          and: [
            { matchStatus: { eq: 'WAITING' } },
            { player2Id: { attributeExists: false } }
          ]
        }
      })
  
      let matchId: string
  
      // If waiting match exists, join the game
      if (waitingMatches.length > 0) {
        matchId = waitingMatches[0].id
        await client.models.Match.update({
          id: matchId,
          player2Id: playerId,
          matchStatus: 'MATCHED'
        })
        await client.models.Player.update({
          id: playerId,
          currentMatchId: matchId
        })
      }
      // If no waiting match, create a new match
      else {
        matchId = crypto.randomUUID()
        await client.models.Match.create({
          id: matchId,
          player1Id: playerId,
          matchStatus: 'WAITING'
        })
        await client.models.Player.update({
          id: playerId,
          currentMatchId: matchId
        })
      }

      // Redirect to match room with matchId as query parameter
      onClose()
      router.push(`/match-room?matchId=${matchId}&playerId=${playerId}`)
    }
    catch (error) {
      console.error('Error joining match:', error)
      setIsLoading(false)
    }
    finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">Enter Your Nickname</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            minLength={2}
            required
            className="w-full"
            disabled={isLoading}
          />
          <div className="flex space-x-2">
            <Button
              onClick={handleSubmit}
              type="submit" 
              className="w-full"
              disabled={isLoading || nickname.length < 2}
            >
              {isLoading ? 'Creating...' : 'Enter Match Room'}
            </Button>
            <Button 
              type="button"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
