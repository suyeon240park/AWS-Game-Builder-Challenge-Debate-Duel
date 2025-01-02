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
      const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const newPlayer = await client.models.Player.create({
        playerId: playerId,
        nickname: nickname.trim()
      })

      localStorage.setItem('playerId', playerId)
      localStorage.setItem('playerNickname', nickname.trim())

      onClose() // Call onClose after successful creation
      router.push('/match-room')
    } catch (error) {
      console.error('Error creating player:', error)
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
              variant="outline"
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
