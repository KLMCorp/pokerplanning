'use client';

/**
 * Composant FlyingEmoji - Animation d'emoji volant à travers la table
 */

import { useEffect, useState, useRef } from 'react';

interface FlyingEmojiProps {
  emoji: string;
  getFromPosition: () => { x: number; y: number };
  getToPosition: () => { x: number; y: number };
  onComplete?: () => void;
}

export default function FlyingEmoji({ emoji, getFromPosition, getToPosition, onComplete }: FlyingEmojiProps) {
  const getFromRef = useRef(getFromPosition);
  const getToRef = useRef(getToPosition);
  const onCompleteRef = useRef(onComplete);

  const [fromPos, setFromPos] = useState<{ x: number; y: number } | null>(null);
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const from = getFromRef.current();
    const to = getToRef.current();
    setFromPos(from);

    // Démarrer l'animation après le premier rendu (GPU-accelerated via translate3d)
    const startTimeout = setTimeout(() => {
      setDelta({ x: to.x - from.x, y: to.y - from.y });
    }, 50);

    // Disparaître à l'arrivée
    const hideTimeout = setTimeout(() => {
      setVisible(false);
      onCompleteRef.current?.();
    }, 850);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(hideTimeout);
    };
  }, []);

  if (!visible || !fromPos) return null;

  return (
    <div
      className="fixed pointer-events-none z-[300] text-xl"
      style={{
        left: fromPos.x,
        top: fromPos.y,
        transform: `translate(-50%, -50%) translate3d(${delta.x}px, ${delta.y}px, 0)`,
        transition: 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      {emoji}
    </div>
  );
}
