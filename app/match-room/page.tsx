"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Loader2 } from 'lucide-react'

export default function MatchRoom() {
  const [matchState, setMatchState] = useState<'waiting' | 'found' | 'ready'>('waiting')
  const [playerReady, setPlayerReady] = useState(false)
  const [opponentReady, setOpponentReady] = useState(false)

  // Simulate finding a match after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setMatchState('found')
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  const handleReady = () => {
    setPlayerReady(true)
    // Simulate opponent getting ready after 2 seconds
    setTimeout(() => {
      setOpponentReady(true)
    }, 2000)
  }

  useEffect(() => {
    if (playerReady && opponentReady) {
      setMatchState('ready')
    }
  }, [playerReady, opponentReady])

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
              <PlayerStatus name="You" ready={playerReady} />
              <span className="text-2xl font-bold text-gray-600">VS</span>
              <PlayerStatus name="Opponent" ready={opponentReady} />
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

        {matchState === 'ready' && (
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

