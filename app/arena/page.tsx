"use client"

import { useState, useEffect, useCallback } from 'react' // Added useCallback
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'

export default function GameScreen() {
  const router = useRouter()
  const [playerScore, setPlayerScore] = useState(50)
  const [opponentScore, setOpponentScore] = useState(50)
  const [playerArgument, setPlayerArgument] = useState('')
  const [opponentArgument, setOpponentArgument] = useState('')
  const [timer, setTimer] = useState(30)
  const [currentTurn, setCurrentTurn] = useState<'player' | 'opponent'>('player')
  const [roundNumber, setRoundNumber] = useState(1)
  const [showHit, setShowHit] = useState(false)

  const simulateOpponentTurn = useCallback(() => {
    let typingInterval: NodeJS.Timeout // Changed from let to const
    const opponentFullArgument = "This is the opponent's simulated argument."
    let currentIndex = 0

    typingInterval = setInterval(() => {
      if (currentIndex < opponentFullArgument.length) {
        setOpponentArgument((prev) => prev + opponentFullArgument[currentIndex])
        currentIndex++
      } else {
        clearInterval(typingInterval)
        setTimeout(() => {
          const score = Math.floor(Math.random() * 20) + 1
          setOpponentScore((prevScore) => Math.min(prevScore + score, 100))
          setPlayerScore((prevScore) => Math.max(prevScore - score, 0))
          setOpponentArgument('')
          handleTurnEnd()
        }, 1000)
      }
    }, 100)
  }, []) // Empty dependency array since it doesn't depend on any state

  const handleTurnEnd = useCallback(() => {
    setShowHit(true)
    setTimeout(() => {
      setShowHit(false)
      if (currentTurn === 'player') {
        setCurrentTurn('opponent')
        simulateOpponentTurn()
      } else {
        setCurrentTurn('player')
        if (roundNumber < 3) {
          setRoundNumber((prevRound) => prevRound + 1)
        } else {
          router.push(`/result?playerScore=${playerScore}&opponentScore=${opponentScore}`)
        }
      }
      setTimer(30)
    }, 2000)
  }, [currentTurn, roundNumber, router, playerScore, opponentScore, simulateOpponentTurn])

  const handleSubmit = useCallback(() => {
    if (playerArgument.trim() !== '') {
      const score = Math.floor(Math.random() * 20) + 1
      setPlayerScore((prevScore) => Math.min(prevScore + score, 100))
      setOpponentScore((prevScore) => Math.max(prevScore - score, 0))
      setPlayerArgument('')
      handleTurnEnd()
    }
  }, [playerArgument, handleTurnEnd])

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prevTimer) => {
        if (prevTimer > 0) {
          return prevTimer - 1
        } else {
          clearInterval(interval)
          handleTurnEnd()
          return 0
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [currentTurn, handleTurnEnd])

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-between p-4">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-8 space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-serif font-bold text-gray-800">Round {roundNumber}</h1>
          <div className="text-2xl font-bold text-gray-800">{timer}s</div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium text-gray-700">
            <span>You</span>
            <span>Opponent</span>
          </div>
          <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
            <Progress value={playerScore} className="absolute left-0 h-full bg-blue-500" />
            <Progress value={opponentScore} className="absolute right-0 h-full bg-red-500" style={{width: `${opponentScore}%`}} />
          </div>
        </div>

        <div className="h-40 bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden">
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
          {currentTurn === 'player' ? (
            <p className="text-2xl font-serif text-gray-800">Your turn to argue!</p>
          ) : (
            <p className="text-2xl font-serif text-gray-800">Opponent is arguing: {opponentArgument}</p>
          )}
        </div>

        <div className="space-y-4">
          <Input
            type="text"
            placeholder="Type your argument here..."
            value={playerArgument}
            onChange={(e) => setPlayerArgument(e.target.value)}
            disabled={currentTurn !== 'player'}
            className="w-full p-4 text-lg"
          />
          <Button 
            onClick={handleSubmit} 
            disabled={currentTurn !== 'player' || playerArgument.trim() === ''}
            className="w-full text-lg py-6"
            size="lg"
          >
            Submit Argument
          </Button>
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-600">
        <p>Debate Duel - May the best arguer win!</p>
      </footer>
    </div>
  )
}

