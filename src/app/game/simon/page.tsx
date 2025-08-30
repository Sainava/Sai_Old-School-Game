"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './page.module.css';

type GameState = 'idle' | 'showing' | 'input' | 'success' | 'failure';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_CONFIG = {
  easy: { buttons: 4, name: '4 Buttons (Easy)', gridClass: 'grid4' },
  medium: { buttons: 7, name: '7 Buttons (Medium)', gridClass: 'grid7' },
  hard: { buttons: 10, name: '10 Buttons (Hard)', gridClass: 'grid10' }
};

const BUTTON_COLORS = [
  '#FF3737', // Red
  '#22C55E', // Green  
  '#3B82F6', // Blue
  '#FBBF24', // Yellow
  '#8B5CF6', // Purple
  '#F97316', // Orange
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F59E0B'  // Amber
];

const BUTTON_FREQUENCIES = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];

const Simon = () => {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerInput, setPlayerInput] = useState<number[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [showingIndex, setShowingIndex] = useState(-1);
  const [strictMode, setStrictMode] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [sequenceInterval, setSequenceInterval] = useState<NodeJS.Timeout | null>(null);
  const [buttonPressTimeout, setButtonPressTimeout] = useState<NodeJS.Timeout | null>(null);
  const isSequenceCancelledRef = useRef(false);

  // Load best score from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`simon-best-${difficulty}`);
    if (saved) setBestScore(parseInt(saved));
  }, [difficulty]);

  // Save best score when it changes
  useEffect(() => {
    if (currentRound > bestScore) {
      setBestScore(currentRound);
      localStorage.setItem(`simon-best-${difficulty}`, currentRound.toString());
    }
  }, [currentRound, bestScore, difficulty]);

  // Initialize Web Audio API
  const initAudio = useCallback(() => {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      setAudioContext(context);
      return context;
    }
    return audioContext;
  }, [audioContext]);

  // Play tone for button
  const playTone = useCallback((buttonIndex: number, duration: number = 200) => {
    const context = initAudio();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.frequency.setValueAtTime(BUTTON_FREQUENCIES[buttonIndex], context.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration / 1000);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration / 1000);
  }, [initAudio]);

  // Play error sound
  const playErrorSound = useCallback(() => {
    const context = initAudio();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.frequency.setValueAtTime(150, context.currentTime); // Low error tone
    oscillator.type = 'sawtooth';
    
    gainNode.gain.setValueAtTime(0.2, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.5);
  }, [initAudio]);

  // Start new game
  const startGame = () => {
    setGameState('showing');
    setCurrentRound(1);
    setPlayerInput([]);
    const newSequence = [Math.floor(Math.random() * DIFFICULTY_CONFIG[difficulty].buttons)];
    setSequence(newSequence);
    showSequence(newSequence);
  };

  // Show sequence to player
  const showSequence = useCallback((seq: number[]) => {
    let index = 0;
    setShowingIndex(-1);
    isSequenceCancelledRef.current = false;
    
    // Clear any existing interval
    if (sequenceInterval) {
      clearInterval(sequenceInterval);
    }
    
    const interval = setInterval(() => {
      // Check if sequence was cancelled
      if (isSequenceCancelledRef.current) {
        clearInterval(interval);
        setSequenceInterval(null);
        return;
      }
      
      if (index < seq.length) {
        setShowingIndex(seq[index]);
        playTone(seq[index]);
        
        setTimeout(() => {
          if (!isSequenceCancelledRef.current) {
            setShowingIndex(-1);
          }
        }, 400);
        
        index++;
      } else {
        clearInterval(interval);
        setSequenceInterval(null);
        setTimeout(() => {
          if (!isSequenceCancelledRef.current) {
            setGameState('input');
          }
        }, 600);
      }
    }, 700);
    
    setSequenceInterval(interval);
  }, [sequenceInterval, playTone]);

  // Handle button click
  const handleButtonClick = (buttonIndex: number) => {
    if (gameState !== 'input') return;

    // Show button press animation
    setShowingIndex(buttonIndex);
    playTone(buttonIndex, 100);
    
    // Clear any existing button press timeout
    if (buttonPressTimeout) {
      clearTimeout(buttonPressTimeout);
    }
    
    // Hide button animation after brief delay
    const timeout = setTimeout(() => {
      setShowingIndex(-1);
    }, 150);
    setButtonPressTimeout(timeout);

    const newInput = [...playerInput, buttonIndex];
    setPlayerInput(newInput);

    // Check if input matches sequence so far
    if (newInput[newInput.length - 1] !== sequence[newInput.length - 1]) {
      // Wrong input
      setGameState('failure');
      playErrorSound(); // Better error sound
      
      if (strictMode) {
        // Strict mode: game over
        setTimeout(() => {
          setGameState('idle');
          setCurrentRound(0);
          setSequence([]);
          setPlayerInput([]);
        }, 1500);
      } else {
        // Non-strict mode: replay current sequence
        setTimeout(() => {
          setPlayerInput([]);
          setGameState('showing');
          showSequence(sequence);
        }, 1500);
      }
      return;
    }

    // Check if round is complete
    if (newInput.length === sequence.length) {
      setGameState('success');
      
      setTimeout(() => {
        // Add new step to sequence
        const nextRound = currentRound + 1;
        setCurrentRound(nextRound);
        const newSequence = [...sequence, Math.floor(Math.random() * DIFFICULTY_CONFIG[difficulty].buttons)];
        setSequence(newSequence);
        setPlayerInput([]);
        setGameState('showing');
        showSequence(newSequence);
      }, 800);
    }
  };

    // Keyboard support
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameState !== 'input') return;

      const buttonCount = DIFFICULTY_CONFIG[difficulty].buttons;
      let buttonIndex = -1;

      // Number keys 1-9, 0
      if (e.key >= '1' && e.key <= '9') {
        buttonIndex = parseInt(e.key) - 1;
      } else if (e.key === '0') {
        buttonIndex = 9;
      }
      // Arrow keys for 4-button mode
      else if (buttonCount === 4) {
        switch (e.key) {
          case 'ArrowUp': buttonIndex = 0; break;
          case 'ArrowRight': buttonIndex = 1; break;
          case 'ArrowDown': buttonIndex = 2; break;
          case 'ArrowLeft': buttonIndex = 3; break;
        }
      }
      // WASD keys
      else {
        switch (e.key.toLowerCase()) {
          case 'w': buttonIndex = 0; break;
          case 'd': buttonIndex = 1; break;
          case 's': buttonIndex = 2; break;
          case 'a': buttonIndex = 3; break;
          case 'e': buttonIndex = 4; break;
          case 'r': buttonIndex = 5; break;
          case 'f': buttonIndex = 6; break;
          case 'c': buttonIndex = 7; break;
          case 'v': buttonIndex = 8; break;
          case 'b': buttonIndex = 9; break;
        }
      }

      if (buttonIndex >= 0 && buttonIndex < buttonCount) {
        handleButtonClick(buttonIndex);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, difficulty, handleButtonClick]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (sequenceInterval) {
        clearInterval(sequenceInterval);
      }
      if (buttonPressTimeout) {
        clearTimeout(buttonPressTimeout);
      }
    };
  }, [sequenceInterval, buttonPressTimeout]);

  const resetGame = () => {
    // Cancel any running sequence immediately
    isSequenceCancelledRef.current = true;
    
    // Clear any running intervals/timeouts immediately
    if (sequenceInterval) {
      clearInterval(sequenceInterval);
      setSequenceInterval(null);
    }
    if (buttonPressTimeout) {
      clearTimeout(buttonPressTimeout);
      setButtonPressTimeout(null);
    }
    
    // Reset all state immediately
    setShowingIndex(-1);
    setPlayerInput([]);
    setCurrentRound(1);
    
    // If we're in the middle of a game (not idle), restart the current game
    if (gameState !== 'idle') {
      const newSequence = [Math.floor(Math.random() * DIFFICULTY_CONFIG[difficulty].buttons)];
      setSequence(newSequence);
      setGameState('showing');
      // Small delay to ensure cancellation is processed
      setTimeout(() => {
        showSequence(newSequence);
      }, 50);
    } else {
      // If we're already idle, go back to difficulty selection
      setGameState('idle');
      setCurrentRound(0);
      setSequence([]);
    }
  };

  const goToMenu = () => {
    // Cancel any running sequence
    isSequenceCancelledRef.current = true;
    
    // Clear any running intervals/timeouts
    if (sequenceInterval) {
      clearInterval(sequenceInterval);
      setSequenceInterval(null);
    }
    if (buttonPressTimeout) {
      clearTimeout(buttonPressTimeout);
      setButtonPressTimeout(null);
    }
    
    setGameState('idle');
    setCurrentRound(0);
    setSequence([]);
    setPlayerInput([]);
    setShowingIndex(-1);
  };

  const buttonCount = DIFFICULTY_CONFIG[difficulty].buttons;

  return (
    <div className={styles.container}>
      <div id={styles.bgGrid}>
        <div id={styles.blurGrid}></div>
      </div>

      <div className={styles.header}>
        <h1>Simon Says</h1>
        <div className={styles.scoreBoard}>
          <div>Round: <span className={styles.score}>{currentRound}</span></div>
          <div>Best: <span className={styles.score}>{bestScore}</span></div>
        </div>
      </div>

      {gameState === 'idle' && (
        <div className={styles.menu}>
          <div className={styles.difficultySelector}>
            <h3>Select Difficulty</h3>
            {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                className={`${styles.difficultyButton} ${difficulty === key ? styles.selected : ''}`}
                onClick={() => setDifficulty(key as Difficulty)}
              >
                {config.name}
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={strictMode}
                onChange={(e) => setStrictMode(e.target.checked)}
              />
              Strict Mode (mistake = game over)
            </label>
            <button className={styles.startButton} onClick={startGame}>
              Start Game
            </button>
          </div>
        </div>
      )}

      {gameState !== 'idle' && (
        <>
          <div className={styles.status} role="status" aria-live="polite">
            {gameState === 'showing' && 'Watch the sequence...'}
            {gameState === 'input' && 'Your turn!'}
            {gameState === 'success' && '✓ Correct!'}
            {gameState === 'failure' && '✗ Wrong!'}
          </div>

          <div className={`${styles.gameBoard} ${styles[DIFFICULTY_CONFIG[difficulty].gridClass]}`}>
            {Array.from({ length: buttonCount }, (_, i) => (
              <button
                key={i}
                className={`${styles.gameButton} ${showingIndex === i ? styles.active : ''}`}
                style={{ 
                  backgroundColor: BUTTON_COLORS[i],
                  opacity: showingIndex === i ? 1 : 0.7
                }}
                onClick={() => handleButtonClick(i)}
                disabled={gameState !== 'input'}
                aria-label={`Button ${i + 1}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className={styles.gameControls}>
            <button className={styles.resetButton} onClick={resetGame}>
              Restart Round
            </button>
            <button className={styles.menuButton} onClick={goToMenu}>
              Back to Menu
            </button>
          </div>
        </>
      )}

      <div className={styles.instructions}>
        <h4>How to Play:</h4>
        <p>Watch the sequence of button flashes, then repeat it back by clicking the buttons in the same order.</p>
        <p><strong>Keyboard:</strong> Use number keys 1-{buttonCount} or WASD + ERFCVB</p>
        {difficulty === 'easy' && <p><strong>Easy mode:</strong> Also use Arrow keys ↑→↓←</p>}
      </div>
    </div>
  );
};

export default Simon;
