"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'
import { type Schema } from '@/amplify/data/resource'
import { generateClient } from 'aws-amplify/api'
import { toast } from 'sonner'
import { Sword, Shield, Clock, MessageCircle} from 'lucide-react'
import { Textarea } from "@/components/ui/textarea"

//import { PanelTopIcon } from 'lucide-react'

// Constants
const GAME_CONSTANTS = {
  INITIAL_SCORE: 50,
  MAX_ROUNDS: 3,
  TURN_TIME: 10 as number,
  TYPING_THROTTLE: 1000,
  HIT_ANIMATION_DURATION: 2000,
  MIN_ARGUMENT_LENGTH: 10,
  MAX_ARGUMENT_LENGTH: 200
} as const

// Types
interface GameState {
  status: 'loading' | 'error' | 'success'
  message?: string
}

interface GameData {
  match: Schema['Match']['type'] | null
  topic: string | null
  player: Schema['Player']['type'] | null
  opponent: Schema['Player']['type'] | null
}

// Components
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gradient-to-b from-amber-100 to-amber-200 flex items-center justify-center">
    <div className="text-2xl font-bold text-gray-700 animate-pulse">Loading arena...</div>
  </div>
)

const ErrorMessage = ({ message }: { message: string }) => (
  <div className="flex items-center gap-2 text-red-600">
    <span>{message}</span>
  </div>
)

const ScoreDisplay = ({ player, opponent }: { player: number, opponent: number }) => (
  <div className="space-y-2">
    <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
      <Progress value={player} className="absolute left-0 h-full bg-blue-500" />
      <Progress value={opponent} className="absolute right-0 h-full bg-red-500" style={{width: `${opponent}%`}} />
    </div>
    <div className="flex justify-between text-sm font-medium text-gray-700">
      <span>{player}</span>
      <span>{opponent}</span>
    </div>
  </div>
)

const client = generateClient<Schema>()

const ArenaPageContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const matchId = searchParams.get('matchId')
  const currentPlayerId = searchParams.get('playerId')
  const prevTurnRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameState>({ status: 'loading' })
  const [gameData, setGameData] = useState<GameData>({
    match: null,
    topic: null,
    player: null,
    opponent: null
  })

  const [timer, setTimer] = useState<number>(GAME_CONSTANTS.TURN_TIME)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerArgument, setPlayerArgument] = useState('')
  const [showHit, setShowHit] = useState(false)
  const [opponentTyping, setOpponentTyping] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const lastTypingUpdate = useRef<number>(0)
  const [scoreChangeAnimation, setScoreChangeAnimation] = useState(0)

  const isPlayerTurn = useCallback((): boolean => {
    if (!gameData.match) return false;
    const isPlayer1 = gameData.player?.id === gameData.match.player1Id;
    return (
      (isPlayer1 && gameData.match.currentTurn === 1) ||
      (!isPlayer1 && gameData.match.currentTurn === 2)
    );
  }, [gameData.match, gameData.player?.id]);



  // Initialize game
  useEffect(() => {
    if (!matchId || !currentPlayerId) {
      router.push('/')
      return
    }

    const initializeGame = async () => {
      try {
        setGameState({ status: 'loading' })

        const [matchResponse, playersResponse] = await Promise.all([
          client.models.Match.get({ id: matchId }),
          client.models.Player.list({
            filter: { currentMatchId: { eq: matchId } }
          })
        ])

        const matchData = matchResponse.data
        if (!matchData) throw new Error('Match not found')

        const players = playersResponse.data
        if (!players || players.length !== 2) throw new Error('Players not found')

        const currentPlayer = players.find(p => p.id === currentPlayerId)
        const opponentPlayer = players.find(p => p.id !== currentPlayerId)

        if (!currentPlayer || !opponentPlayer) {
          throw new Error('Player identification failed')
        }

        setGameData({
          match: { ...matchData },
          player: currentPlayer,
          opponent: opponentPlayer,
          topic: matchData.topic
        })

        setGameState({ status: 'success' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize game'
        setGameState({ status: 'error', message })
        toast.error(message)
      }
    }

    initializeGame()
  }, [matchId, currentPlayerId, router])

  // Handle player typing with throttling
  const handlePlayerTyping = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPlayerArgument(value);
    
    const now = Date.now();
    if (!isTyping || now - lastTypingUpdate.current > GAME_CONSTANTS.TYPING_THROTTLE) {
      setIsTyping(true);
      lastTypingUpdate.current = now;
      
      // Update match with current argument
      client.models.Match.update({
        id: matchId!,
        typingPlayerId: currentPlayerId,
        isTyping: true,
        [gameData.player?.id === gameData.match?.player1Id ? 'player1Argument' : 'player2Argument']: value
      }).catch(error => {
        console.warn('Typing sync failed:', error);
      });

      // Auto-clear typing status after delay
      setTimeout(() => {
        setIsTyping(false);
        client.models.Match.update({
          id: matchId!,
          typingPlayerId: currentPlayerId,
          isTyping: false
        }).catch(error => {
          console.warn('Typing clear failed:', error);
        });
      }, GAME_CONSTANTS.TYPING_THROTTLE + 500);
    }
  }, [isTyping, currentPlayerId, matchId, gameData.player?.id, gameData.match?.player1Id]);


  const handleGameEnd = useCallback(async () => {
    if (!matchId) return;
  
    try {
      await client.models.Match.update({
        id: matchId,
        matchStatus: 'FINISHED'
      });
      // Don't redirect here - let the subscription handle it
    } catch (error) {
      const message = error instanceof Error ? 
        error.message : 
        'Failed to end game properly';
      toast.error(message);
      console.error('Game end error:', error);
    }
  }, [matchId]);
  

  const handleSubmit = async () => {
    if (!isPlayerTurn() || isSubmitting || !matchId || !gameData.player?.id) {
      console.log("Early return conditions:", {
        isPlayerTurn: isPlayerTurn(),
        isSubmitting,
        matchId,
        playerId: gameData.player?.id
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current player data to get existing score
      if (matchId && currentPlayerId) {
        const playersResponse = await client.models.Player.list({
          filter: { currentMatchId: { eq: matchId } }
        });
        
        const players = playersResponse.data;
        if (!players || players.length !== 2) {
          throw new Error('Players not found');
        }

        const currentPlayer = players.find(p => p.id === currentPlayerId);
        const opponentPlayer = players.find(p => p.id !== currentPlayerId);

        if (!currentPlayer || !opponentPlayer) {
          throw new Error('Player identification failed');
        }

        console.log("Evaluating debate with:", {
          topic: gameData.topic,
          argument: playerArgument
        });

        const { data, errors } = await client.queries.evaluateDebate({
          prompt: `Topic: ${gameData.topic} Argument: ${playerArgument}`
        });
    
        if (errors) {
          console.log(errors);
        }

        console.log("Debate score: ", data);
        setScoreChangeAnimation(data || 0)
        const newScore = (currentPlayer.score || GAME_CONSTANTS.INITIAL_SCORE) + data!;
        console.log("New score: ", newScore)

        // Update score in database
        await client.models.Player.update({
          id: currentPlayerId,
          score: newScore
        });

        // Update local state
        setGameData(prev => ({
          ...prev,
          player: {
            ...prev.player!,
            score: newScore
          }
        }));

        toast.success(`Scored ${data} points!`);

        // Visual feedback
        setPlayerArgument('');
        setShowHit(true);
        setTimeout(() => setShowHit(false), 1000);

        const matchData = gameData.match;
        if (!matchData) {
          throw new Error('Match data not found');
        }

        // Check if game should end
        if (matchData.roundNumber === GAME_CONSTANTS.MAX_ROUNDS && matchData.currentTurn === 2) {
          console.log("Game ending - max rounds reached");
          await handleGameEnd();
          return;
        }

        // Calculate next turn and round
        const nextTurn = matchData.currentTurn === 1 ? 2 : 1;
        const nextRound = matchData.currentTurn === 2 ? matchData.roundNumber + 1 : matchData.roundNumber;

        console.log("Updating match state:", {
          nextTurn,
          nextRound,
          currentRound: matchData.roundNumber,
          currentTurn: matchData.currentTurn
        });

        // Update match with new turn/round and reset argument
        await client.models.Match.update({
          id: matchId,
          currentTurn: nextTurn,
          roundNumber: nextRound,
          timer: GAME_CONSTANTS.TURN_TIME,
          player1Argument: null,
          player2Argument: null
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
      const message = error instanceof Error ? error.message : 'Failed to submit argument';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // Update subscription effect
  useEffect(() => {
    if (!matchId || gameState.status !== 'success') return;

    const sub = client.models.Match.observeQuery({
      filter: { id: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        const matchData = items[0];
        if (!matchData) return;

        // Preserve existing scores while updating other data
        setGameData(prev => ({
          ...prev,
          match: matchData,
          player: prev.player ? {
            ...prev.player,
            score: prev.player.score
          } : null,
          opponent: prev.opponent ? {
            ...prev.opponent,
            score: prev.opponent.score
          } : null
        }));

        if (matchData.currentTurn !== prevTurnRef.current) {
          setTimer(GAME_CONSTANTS.TURN_TIME);
        }
        
        prevTurnRef.current = matchData.currentTurn;
        
        const isPlayer1 = gameData.player?.id === matchData.player1Id;
        const opponentArgument = isPlayer1 ? matchData.player2Argument : matchData.player1Argument;
        setOpponentTyping(opponentArgument || '');
      },
      error: (error) => console.error('Subscription error:', error)
    });

    return () => {
      sub.unsubscribe();
      if (timerInterval.current) {
        clearInterval(timerInterval.current as NodeJS.Timeout);
      }
    };
  }, [matchId, gameState.status, currentPlayerId, router, gameData.player?.id]);

  const checkMatchStatus = async () => {
    try {
      const matchResponse = await client.models.Match.get({ id: matchId! });
      const matchData = matchResponse.data;
      
      if (matchData?.matchStatus === 'FINISHED') {
        if (timerInterval.current) {
          clearInterval(timerInterval.current as NodeJS.Timeout);
        }
        router.push(`/result?matchId=${matchId}&playerId=${currentPlayerId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to check match status:', error);
      return false;
    }
  };


  // Timer effect
  useEffect(() => {
    if (gameState.status !== 'success') return;

    const runTimer = async () => {
      // Check match status first
      const isFinished = await checkMatchStatus();
      if (isFinished) return;

      setTimer(prev => {
        const newTimer = Math.max(0, prev - 1);
        
        if (newTimer === 0) {
          const matchData = gameData.match;
          if (!matchData) return prev;

          // Check for game end
          if (matchData.roundNumber === GAME_CONSTANTS.MAX_ROUNDS && matchData.currentTurn === 2) {
            handleGameEnd();
            return GAME_CONSTANTS.TURN_TIME;
          }

          // Update match in DB when timer expires
          client.models.Match.update({
            id: matchId!,
            currentTurn: matchData.currentTurn === 1 ? 2 : 1,
            roundNumber: matchData.currentTurn === 2 ? matchData.roundNumber + 1 : matchData.roundNumber,
            timer: GAME_CONSTANTS.TURN_TIME,
            player1Argument: null,
            player2Argument: null
          }).catch(console.error);

          return GAME_CONSTANTS.TURN_TIME;
        }

        return newTimer;
      });
    };

    timerInterval.current = setInterval(runTimer, 1000);

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current as NodeJS.Timeout);
      }
    };
  }, [gameState.status, matchId, gameData.match, checkMatchStatus, handleGameEnd]);




  if (gameState.status === 'loading') {
    return <LoadingSpinner />
  }

  if (gameState.status === 'error') {
    return <ErrorMessage message={gameState.message || 'Unknown error'} />
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 p-4">
      <div className="h-full w-full max-w-4xl mx-auto flex flex-col space-y-6">
        {/* Header Section */}
        <div className="bg-white bg-opacity-90 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-gray-800 mb-4 text-center">
            Round {gameData.match?.roundNumber} - {gameData.topic}
          </h1>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium text-gray-700">
              <span>{gameData.player?.nickname}</span>
              <span>{gameData.opponent?.nickname}</span>
            </div>
            <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
              <Progress value={gameData.player?.score} className="absolute left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600" />
              <Progress value={gameData.opponent?.score} className="absolute right-0 h-full bg-gradient-to-r from-red-600 to-red-500" style={{width: `${gameData.opponent.score}%`}} />
              <div className="absolute inset-0 flex justify-center items-center">
                <span className="text-xs font-bold text-white">
                  {gameData.player?.score} - {gameData.opponent?.score}
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className={"text-sm font-bold text-green-500"}>
                {'+'}{scoreChangeAnimation}
              </span>
              <span className={"text-sm font-bold text-green-500"}>
                {'+0'}
              </span>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="bg-white bg-opacity-90 rounded-lg p-6 shadow-lg backdrop-blur-sm flex flex-col flex-grow overflow-hidden space-y-4">
          <div className="mb-2 flex justify-between items-center">
            <span className="text-base font-medium flex items-center">
              {isPlayerTurn() ? <Sword className="mr-2 text-blue-500" /> : <Shield className="mr-2 text-red-500" />}
              {isPlayerTurn() ? "Your Turn" : "Opponent's Turn"}
            </span>
            <span className="text-base font-medium flex items-center">
              <Clock className="mr-2 text-purple-500" />
              Time: {timer}s
            </span>
          </div>

          {/* Argument Input */}
          <div className="space-y-4 flex-grow flex flex-col">
            <div className="relative flex-grow flex flex-col overflow-hidden">
              <Textarea
                placeholder={isPlayerTurn() ? "Type your argument..." : "Waiting for opponent..."}
                value={playerArgument}
                onChange={handlePlayerTyping}
                disabled={!isPlayerTurn() || isSubmitting}
                className="w-full p-3 pr-16 bg-opacity-75 backdrop-blur-sm resize-none flex-grow overflow-auto"
              />
              <span className="absolute right-2 bottom-2 text-sm text-gray-500">
                {playerArgument.length}/{GAME_CONSTANTS.MAX_ARGUMENT_LENGTH}
              </span>
            </div>
            
            {/* Opponent's Argument Display */}
            {opponentTyping && !isPlayerTurn() && (
              <div className="p-4 bg-red-100 rounded-lg relative animate-pulse mb-4">
                <MessageCircle className="absolute top-2 left-2 text-red-400" />
                <p className="pl-8">{opponentTyping}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!isPlayerTurn() || isSubmitting || playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-2 px-4 rounded-full transition duration-300 ease-in-out transform hover:scale-105"
            >
              {isSubmitting ? "Submitting..." : "Submit Argument"}
            </Button>
          </div>
        </div>

        {/* Hit Animation */}
        <AnimatePresence>
          {showHit && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-6xl font-bold text-red-500">HIT!</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ArenaPageContent />
    </Suspense>
  )
}
