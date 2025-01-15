"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'
import { type Schema } from '@/amplify/data/resource'
import { generateClient } from 'aws-amplify/api'
import { toast } from 'sonner'
import { Sword, Shield, Clock, MessageCircle} from 'lucide-react'


// Constants
const GAME_CONSTANTS = {
  INITIAL_SCORE: 50,
  MAX_ROUNDS: 3,
  TURN_TIME: 20 as number,
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

const client = generateClient<Schema>()

const ArenaPageContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const matchId = searchParams.get('matchId')
  const currentPlayerId = searchParams.get('playerId')
  const prevTurnRef = useRef<number | null>(null)

  // State
  const [gameState, setGameState] = useState<GameState>({ status: 'loading' })
  const [gameData, setGameData] = useState<GameData>({
    match: null,
    topic: null,
    player: null,
    opponent: null
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerArgument, setPlayerArgument] = useState('')
  const [showHit, setShowHit] = useState(false)
  const [opponentTyping, setOpponentTyping] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const lastTypingUpdate = useRef<number>(0)
  const [playerScoreChange, setPlayerScoreChange] = useState(0)
  const [opponentScoreChange, setOpponentScoreChange] = useState(0);

  // Utility functions
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
          match: matchData,
          topic: matchData.topic || null,
          player: currentPlayer,
          opponent: opponentPlayer
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

  // Consolidated subscription for game updates
  useEffect(() => {
    if (!matchId || !currentPlayerId || gameState.status !== 'success') return;

    const matchSub = client.models.Match.observeQuery({
      filter: { id: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        const matchData = items[0];
        if (!matchData) return;

        
        setGameData(prev => ({
          ...prev,
          match: matchData,
          topic: matchData.topic || prev.topic
        }));

        // Handle turn changes
        if (matchData.currentTurn !== prevTurnRef.current) {
          setTimer(prev => ({
            ...prev,
            value: GAME_CONSTANTS.TURN_TIME,
            lastSync: Date.now(),
            lastUpdate: Date.now()
          }));
          prevTurnRef.current = matchData.currentTurn;
        }

        // Handle opponent score change
        if (matchData.lastScoreChange && matchData.lastScoringPlayerId !== currentPlayerId) {
          setPlayerScoreChange(matchData.lastScoreChange * -1)
          setOpponentScoreChange(matchData.lastScoreChange);
        }

        // Update opponent typing status
        const isPlayer1 = gameData.player?.id === matchData.player1Id;
        const opponentArgument = isPlayer1 ? matchData.player2Argument : matchData.player1Argument;
        setOpponentTyping(opponentArgument || '');
      },
      error: (error) => console.error('Match subscription error:', error)
    });

    const playerSub = client.models.Player.observeQuery({
      filter: { currentMatchId: { eq: matchId } }
    }).subscribe({
      next: ({ items }) => {
        if (items.length === 0) return;

        const currentPlayer = items.find(p => p.id === currentPlayerId);
        const opponentPlayer = items.find(p => p.id !== currentPlayerId);

        setGameData(prev => ({
          ...prev,
          player: currentPlayer || prev.player,
          opponent: opponentPlayer || prev.opponent
        }));
      },
      error: (error) => console.error('Player subscription error:', error)
    });

    return () => {
      matchSub.unsubscribe();
      playerSub.unsubscribe();
    };
  }, [matchId, currentPlayerId, gameState.status, gameData.player?.id]);


  interface TimerState {
    value: number;
    startTime: number;
    serverTime: number;
  }
  
  const [timer, setTimer] = useState<TimerState>({
    value: GAME_CONSTANTS.TURN_TIME,
    startTime: Date.now(),
    serverTime: Date.now()
  });

  useEffect(() => {
    if (!matchId || gameState.status !== 'success') return;
  
    let animationFrameId: number;
    let syncIntervalId: NodeJS.Timeout;
    const startTime = Date.now();
    const initialValue = timer.value;
  
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      const newValue = Math.max(0, initialValue - elapsed);
  
      // Update timer regardless of whose turn it is
      setTimer(prev => ({
        ...prev,
        value: newValue,
        startTime: prev.startTime // Keep original startTime for consistent countdown
      }));
  
      // Only handle turn end if it's the current player's turn
      if (newValue <= 0 && isPlayerTurn()) {
        console.log('Timer reached zero, handling turn end');
        handleTurnEnd();
        return;
      }
  
      animationFrameId = requestAnimationFrame(updateTimer);
    };
  
    // Start timer updates regardless of turn
    animationFrameId = requestAnimationFrame(updateTimer);
  
    // Sync with server periodically
    syncIntervalId = setInterval(async () => {
      try {
        const response = await client.models.Match.get({ id: matchId });
        console.log('Server sync response:', response.data?.timer);
        
        if (response.data?.timer !== undefined) {
          // Only update if there's a significant difference
          const currentValue = Math.max(0, initialValue - Math.floor((Date.now() - startTime) / 1000));
          if (response.data.timer && Math.abs(response.data.timer - currentValue) > 2) {
            setTimer({
              value: response.data.timer,
              startTime: Date.now(),
              serverTime: Date.now()
            });
          }
        }
      } catch (error) {
        console.error('Timer sync failed:', error);
      }
    }, 5000);
  
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
      }
    };
  }, [matchId, gameState.status]);
  
  // Handle turn end
  const handleTurnEnd = async () => {
    console.log('Handle turn end called', {
      matchId,
      isPlayerTurn: isPlayerTurn(),
      currentTurn: gameData.match?.currentTurn
    });
  
    if (!matchId || !isPlayerTurn()) return;
  
    try {
      const nextTurn = gameData.match?.currentTurn === 1 ? 2 : 1;
      const nextRound = gameData.match?.currentTurn === 2 ? 
        (gameData.match.roundNumber + 1) : 
        gameData.match?.roundNumber;
  
      await client.models.Match.update({
        id: matchId,
        currentTurn: nextTurn,
        timer: GAME_CONSTANTS.TURN_TIME,
        roundNumber: nextRound
      });
  
      if (playerArgument.length >= GAME_CONSTANTS.MIN_ARGUMENT_LENGTH) {
        await handleSubmit();
      }
    } catch (error) {
      console.error('Turn end error:', error);
      toast.error('Failed to end turn');
    }
  };
  
  // Visibility change handler - improved to prevent timer jumps
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const syncTimer = async () => {
          try {
            const response = await client.models.Match.get({ id: matchId! });
            if (response.data?.timer !== undefined) {
              // Only update if there's a significant difference
              if (response.data.timer && Math.abs(response.data.timer - timer.value) > 2) {
                setTimer({
                  value: response.data.timer,
                  startTime: Date.now(),
                  serverTime: Date.now()
                });
              }
            }
          } catch (error) {
            console.error('Timer sync failed on visibility change:', error);
          }
        };
        syncTimer();
      }
    };
  
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [matchId, timer.value]);
  


  // Handle player typing with improved throttling
  const handlePlayerTyping = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPlayerArgument(value);
    
    const now = Date.now();
    if (!isTyping || now - lastTypingUpdate.current > GAME_CONSTANTS.TYPING_THROTTLE) {
      setIsTyping(true);
      lastTypingUpdate.current = now;
      
      const updateTypingStatus = async () => {
        try {
          await client.models.Match.update({
            id: matchId!,
            typingPlayerId: currentPlayerId,
            isTyping: true,
            [gameData.player?.id === gameData.match?.player1Id ? 'player1Argument' : 'player2Argument']: value
          });
        } catch (error) {
          console.warn('Typing sync failed:', error);
        }
      };

      updateTypingStatus();

      // Auto-clear typing status after delay
      const typingTimeout = setTimeout(async () => {
        setIsTyping(false);
        try {
          await client.models.Match.update({
            id: matchId!,
            typingPlayerId: currentPlayerId,
            isTyping: false
          });
        } catch (error) {
          console.warn('Typing clear failed:', error);
        }
      }, GAME_CONSTANTS.TYPING_THROTTLE + 500);

      return () => clearTimeout(typingTimeout);
    }
  }, [isTyping, currentPlayerId, matchId, gameData.player?.id, gameData.match?.player1Id]);


  // Handle game end
  const handleGameEnd = useCallback(async () => {
    if (!matchId) return;
  
    try {
      await client.models.Match.update({
        id: matchId,
        matchStatus: 'FINISHED',
        timer: 0
      });
    } catch (error) {
      const message = error instanceof Error ? 
        error.message : 
        'Failed to end game properly';
      toast.error(message);
      console.error('Game end error:', error);
    }
  }, [matchId]);

  // Enhanced submit handler with better error handling and state management
  const handleSubmit = async () => {
    if (!isPlayerTurn() || isSubmitting || !matchId || !gameData.player?.id) {
      console.log("Submit blocked:", {
        isPlayerTurn: isPlayerTurn(),
        isSubmitting,
        matchId,
        playerId: gameData.player?.id
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Fetch fresh player data to ensure accurate scoring
      const playersResponse = await client.models.Player.list({
        filter: { currentMatchId: { eq: matchId } }
      });
      
      const players = playersResponse.data;
      if (!players || players.length !== 2) {
        throw new Error('Players not found during submission');
      }

      const currentPlayer = players.find(p => p.id === currentPlayerId);
      const opponentPlayer = players.find(p => p.id !== currentPlayerId);

      if (!currentPlayerId || !currentPlayer || !opponentPlayer) {
        throw new Error('Player identification failed during submission');
      }

      // Evaluate debate argument
      const evaluationResponse = await client.queries.evaluateDebate({
        prompt: `Topic: ${gameData.topic} Argument: ${playerArgument}`
      });

      if (!evaluationResponse.data && evaluationResponse.errors) {
        throw new Error('Debate evaluation failed');
      }

      const scoreChange = evaluationResponse.data || 0;
      setPlayerScoreChange(scoreChange);
      setOpponentScoreChange(scoreChange * -1);

      // Calculate and update new score
      const newScore = currentPlayer.score! + scoreChange
      
      // Batch updates for better consistency
      await Promise.all([
        // Update player score
        client.models.Player.update({
          id: currentPlayerId,
          score: newScore
        }),

        // Update opponent score
        client.models.Player.update({
          id: opponentPlayer.id,
          score: opponentPlayer.score! - scoreChange
        }),
        
        // Update match state
        client.models.Match.update({
          id: matchId,
          [gameData.player.id === gameData.match?.player1Id ? 'player1Argument' : 'player2Argument']: null,
          currentTurn: gameData.match?.currentTurn === 1 ? 2 : 1,
          roundNumber: gameData.match?.currentTurn === 2 ? 
            (gameData.match.roundNumber + 1) : 
            gameData.match?.roundNumber,
          timer: GAME_CONSTANTS.TURN_TIME
        })
      ]);

      // Clear local state
      setPlayerArgument('');
      
      // Visual feedback
      toast.success(`Scored ${scoreChange} points!`);
      setShowHit(true);
      setTimeout(() => setShowHit(false), GAME_CONSTANTS.HIT_ANIMATION_DURATION);

      // Check for game end condition
      if (gameData.match?.roundNumber === GAME_CONSTANTS.MAX_ROUNDS && 
          gameData.match.currentTurn === 2) {
        console.log("Game ending - max rounds reached");
        await handleGameEnd();
      }

    } catch (error) {
      console.error("Submit error:", error);
      const message = error instanceof Error ? 
        error.message : 
        'Failed to submit argument';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Error boundary effect
  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Unhandled error:', error);
      setGameState(prev => ({
        ...prev,
        status: 'error',
        message: 'An unexpected error occurred'
      }));
      toast.error('An unexpected error occurred. Please refresh the page.');
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Handle game state rendering
  if (gameState.status === 'loading') {
    return <LoadingSpinner />;
  }

  if (gameState.status === 'error') {
    return <ErrorMessage message={gameState.message || 'Unknown error'} />;
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
              <Progress 
                value={gameData.player?.score} 
                className="absolute left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{width: `${gameData.player?.score}%`}}
              />
              <Progress 
                value={gameData.opponent?.score} 
                className="absolute right-0 h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300" 
                style={{width: `${gameData.opponent?.score}%`}}
              />
              <div className="absolute inset-0 flex justify-center items-center">
                <span className="text-xs font-bold text-white drop-shadow">
                  {gameData.player?.score} - {gameData.opponent?.score}
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className={`text-sm font-bold ${playerScoreChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {playerScoreChange > 0 ? '+' : ''}{playerScoreChange}
              </span>
              <span className={`text-sm font-bold ${opponentScoreChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {opponentScoreChange > 0 ? '+' : ''}{opponentScoreChange}
              </span>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="bg-white bg-opacity-90 rounded-lg p-6 shadow-lg backdrop-blur-sm flex flex-col flex-grow overflow-hidden space-y-4">
          <div className="mb-2 flex justify-between items-center">
            <span className="text-base font-medium flex items-center">
              {isPlayerTurn() ? (
                <Sword className="mr-2 text-blue-500 animate-pulse" />
              ) : (
                <Shield className="mr-2 text-red-500" />
              )}
              {isPlayerTurn() ? "Your Turn" : "Opponent's Turn"}
            </span>
            <span className={`text-base font-medium flex items-center ${
              timer.value <= 5 ? 'text-red-500 animate-pulse' : ''
            }`}>
              <Clock className={`mr-2 ${timer.value <= 5 ? 'text-red-500' : 'text-purple-500'}`} />
              Time: {timer.value}s
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
                className={`w-full p-3 pr-16 bg-opacity-75 backdrop-blur-sm resize-none flex-grow overflow-auto
                  ${!isPlayerTurn() ? 'bg-gray-100' : 'bg-white'}
                  ${isSubmitting ? 'opacity-50' : 'opacity-100'}
                  transition-all duration-200`}
                maxLength={GAME_CONSTANTS.MAX_ARGUMENT_LENGTH}
              />
              <span className={`absolute right-2 bottom-2 text-sm ${
                playerArgument.length >= GAME_CONSTANTS.MAX_ARGUMENT_LENGTH ? 'text-red-500' : 'text-gray-500'
              }`}>
                {playerArgument.length}/{GAME_CONSTANTS.MAX_ARGUMENT_LENGTH}
              </span>
            </div>
            
            {/* Opponent's Argument Display */}
            <AnimatePresence>
              {opponentTyping && !isPlayerTurn() && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 bg-red-100 rounded-lg relative animate-pulse mb-4"
                >
                  <MessageCircle className="absolute top-2 left-2 text-red-400" />
                  <p className="pl-8">{opponentTyping}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!isPlayerTurn() || isSubmitting || playerArgument.length < GAME_CONSTANTS.MIN_ARGUMENT_LENGTH}
              className={`w-full bg-gradient-to-r from-blue-500 to-blue-600 
                hover:from-blue-600 hover:to-blue-700 text-white font-bold py-2 px-4 
                rounded-full transition-all duration-300 ease-in-out transform 
                hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed
                disabled:hover:scale-100`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin mr-2">⏳</span>
                  Submitting...
                </span>
              ) : (
                "Submit Argument"
              )}
            </Button>
          </div>
        </div>

        {/* Hit Animation */}
        <AnimatePresence>
          {showHit && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-6xl font-bold text-red-500 drop-shadow-lg">
                HIT!
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ArenaPageContent />
    </Suspense>
  )
}
