'use client';

/**
 * Easter Egg - Code secret configurable
 * Par defaut : Konami Code (haut, haut, bas, bas, gauche, droite, gauche, droite, B, A)
 * Toute la configuration est surchargeable via les props
 */

import { useEffect, useState, useRef, useCallback } from 'react';

// Konami Code sequence (non surchargeable)
const KONAMI_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const KONAMI_SEQUENCE_STR = KONAMI_SEQUENCE.join(',');

// Configuration par defaut
const DEFAULT_EMOJIS = ['🐈‍⬛', '🐱', '😺', '😸', '😻', '🙀', '😿', '😹', '🐈‍⬛', '🐈‍⬛'];
const DEFAULT_TITLE = 'KLM Corp';
const DEFAULT_CENTER_EMOJI = '🐈‍⬛';
const DEFAULT_DANCING_EMOJI = '🐈‍⬛';
const DEFAULT_ITEM_COUNT = 80;
const DEFAULT_DURATION_MS = 12000;
const DEFAULT_DANCING_COUNT = 7;
const DEFAULT_EMOJI_RATIO = 0.7;
const DEFAULT_SUBTITLE = '🎮 KONAMI CODE ACTIVATED! 🎮';

export interface KonamiConfig {
  /** Emojis qui tombent du ciel (defaut: chats) */
  emojis?: string[];
  /** Texte principal affiche au centre (defaut: "KLM Corp") */
  title?: string;
  /** Emoji affiche au-dessus du titre (defaut: 🐈‍⬛) */
  centerEmoji?: string;
  /** Emoji qui danse en bas de l'ecran (defaut: 🐈‍⬛) */
  dancingEmoji?: string;
  /** Nombre d'items qui tombent (defaut: 80) */
  itemCount?: number;
  /** Duree de l'animation en ms (defaut: 12000) */
  durationMs?: number;
  /** Nombre d'emojis dansants en bas (defaut: 7) */
  dancingCount?: number;
  /** Ratio emoji vs texte pour les items tombants, entre 0 et 1 (defaut: 0.7) */
  emojiRatio?: number;
  /** Sous-titre affiche sous la sequence (defaut: "🎮 KONAMI CODE ACTIVATED! 🎮") */
  subtitle?: string;
}

interface FallingItem {
  id: number;
  x: number;
  delay: number;
  duration: number;
  type: 'emoji' | 'text';
  size: number;
}

export default function KonamiEasterEgg(props: KonamiConfig) {
  const {
    emojis = DEFAULT_EMOJIS,
    title = DEFAULT_TITLE,
    centerEmoji = DEFAULT_CENTER_EMOJI,
    dancingEmoji = DEFAULT_DANCING_EMOJI,
    itemCount = DEFAULT_ITEM_COUNT,
    durationMs = DEFAULT_DURATION_MS,
    dancingCount = DEFAULT_DANCING_COUNT,
    emojiRatio = DEFAULT_EMOJI_RATIO,
    subtitle = DEFAULT_SUBTITLE,
  } = props;

  const [activated, setActivated] = useState(false);
  const [items, setItems] = useState<FallingItem[]>([]);
  const inputRef = useRef<string[]>([]);

  const triggerEasterEgg = useCallback(() => {
    if (activated) return; // Eviter les declenchements multiples

    setActivated(true);

    // Generer les items qui tombent
    const newItems: FallingItem[] = [];
    for (let i = 0; i < itemCount; i++) {
      newItems.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 4,
        duration: 3 + Math.random() * 4,
        type: Math.random() < emojiRatio ? 'emoji' : 'text',
        size: 0.6 + Math.random() * 1.2,
      });
    }
    setItems(newItems);

    // Arreter apres la duree configuree
    setTimeout(() => {
      setActivated(false);
      setItems([]);
    }, durationMs);
  }, [activated, itemCount, emojiRatio, durationMs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ajouter la touche a la sequence
      inputRef.current.push(e.key);

      // Garder seulement les 10 dernieres touches
      if (inputRef.current.length > KONAMI_SEQUENCE.length) {
        inputRef.current.shift();
      }

      // Verifier si c'est le Konami Code
      const currentSequence = inputRef.current.join(',');

      if (currentSequence === KONAMI_SEQUENCE_STR) {
        triggerEasterEgg();
        inputRef.current = [];
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerEasterEgg]);

  if (!activated) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {/* Fond avec effet disco */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, rgba(139,0,255,0.3) 0%, rgba(0,0,0,0.5) 100%)',
          animation: 'pulse 1s ease-in-out infinite',
        }}
      />

      {/* Message central */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center z-10">
        <div
          className="text-8xl mb-6"
          style={{ animation: 'bounce 0.5s ease-in-out infinite' }}
        >
          {centerEmoji}
        </div>
        <div
          className="text-5xl md:text-7xl font-black mb-4"
          style={{
            background: 'linear-gradient(90deg, #ff0000, #ff8000, #ffff00, #00ff00, #0080ff, #8000ff, #ff0080, #ff0000)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'rainbow-move 2s linear infinite',
            textShadow: '0 0 30px rgba(255,255,0,0.8)',
          }}
        >
          {title}
        </div>
        <div className="text-white text-xl mt-4 opacity-90" style={{ animation: 'pulse 1s ease-in-out infinite' }}>
          {KONAMI_SEQUENCE.map((key) => {
            const keyMap: Record<string, string> = {
              ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
            };
            return keyMap[key] ?? key.toUpperCase();
          }).join(' ')}
        </div>
        <div className="text-yellow-300 text-lg mt-3 font-bold">
          {subtitle}
        </div>
      </div>

      {/* Items qui tombent */}
      {items.map((item) => (
        <div
          key={item.id}
          className="absolute"
          style={{
            left: `${item.x}%`,
            top: '-60px',
            animation: `fall ${item.duration}s linear ${item.delay}s forwards`,
            fontSize: `${item.size * 2.5}rem`,
          }}
        >
          {item.type === 'emoji' ? (
            <span style={{ filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))' }}>
              {emojis[item.id % emojis.length]}
            </span>
          ) : (
            <span
              className="font-black whitespace-nowrap"
              style={{
                fontSize: `${item.size * 1.2}rem`,
                background: 'linear-gradient(90deg, #ffff00, #ff00ff, #00ffff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 5px rgba(255,255,0,0.8))',
              }}
            >
              {title}
            </span>
          )}
        </div>
      ))}

      {/* Emojis qui dansent en bas */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-6">
        {Array.from({ length: dancingCount }, (_, i) => (
          <span
            key={i}
            className="text-5xl"
            style={{
              animation: `bounce 0.5s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          >
            {dancingEmoji}
          </span>
        ))}
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(calc(100vh + 100px)) rotate(720deg);
            opacity: 0.7;
          }
        }

        @keyframes rainbow-move {
          0% { background-position: 0 center; }
          100% { background-position: 200% center; }
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
