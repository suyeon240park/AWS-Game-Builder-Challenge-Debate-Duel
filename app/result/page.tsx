'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { Suspense } from 'react'

function ResultScreenContent() {
  const searchParams = useSearchParams()
  const playerScore = parseInt(searchParams.get('playerScore') || '0', 10)
  const opponentScore = parseInt(searchParams.get('opponentScore') || '0', 10)

  const winner = playerScore > opponentScore ? 'You' : 'Opponent'

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-8 space-y-8 text-center">
        <h1 className="text-4xl font-serif font-bold text-gray-800">Game Over!</h1>
        
        <div className="space-y-4">
          <p className="text-3xl font-bold text-gray-800">
            {winner === 'You' ? 'You Win!' : 'You Lose!'}
          </p>
          <p className="text-xl text-gray-600">
            Final Scores:
          </p>
          <div className="flex justify-around text-2xl font-bold">
            <span className="text-blue-500">You: {playerScore}</span>
            <span className="text-red-500">Opponent: {opponentScore}</span>
          </div>
        </div>

        <div className="pt-6">
          <Link href="/match-room">
            <Button className="w-full text-lg py-6" size="lg">
              Play Again
            </Button>
          </Link>
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-600">
        <p>Debate Duel - Sharpen your wit for the next battle!</p>
      </footer>
    </div>
  )
}

export default function ResultScreen() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResultScreenContent />
    </Suspense>
  )
}
