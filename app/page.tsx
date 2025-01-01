import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-800 mb-2">Debate Duel</h1>
          <p className="text-xl text-gray-600 italic">Engage in epic battles of wit!</p>
        </div>

        <Button className="w-full text-lg py-6" size="lg">
          Play Now
        </Button>

        <div className="space-y-4">
          <h2 className="text-2xl font-serif font-semibold text-gray-800 text-center">How to Play</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Two players compete in turn-based debates</li>
            <li>Submit your most persuasive arguments each round</li>
            <li>Scores are displayed after each round</li>
            <li>The loser of each round gets visually 'hit'</li>
            <li>Win the game by having the highest score after 3 rounds</li>
          </ul>
        </div>

        <div className="flex justify-center space-x-4">
          <div className="w-1 bg-gray-300"></div>
          <div className="w-1 bg-gray-300"></div>
          <div className="w-1 bg-gray-300"></div>
        </div>
      </div>
    </div>
  )
}

