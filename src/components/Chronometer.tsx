'use client';

/**
 * Composant Chronometer - Countdown visible par tous les participants
 *
 * Architecture réseau :
 * Le serveur ne broadcast que lors des actions PO (start/stop/reset/set).
 * Pendant le countdown, aucun trafic réseau : chaque client calcule localement
 * le temps restant à partir de `timerStartedAt` (timestamp absolu serveur).
 * Formule : remaining = timerDuration - (Date.now() - timerStartedAt)
 *
 * Gestion du négatif :
 * Le timer peut passer sous zéro (overtime). Le calcul continue naturellement
 * et l'affichage bascule en -MM:SS avec un style rouge pulsé.
 *
 * Performance :
 * - React.memo empêche les re-renders depuis le parent (PokerTable)
 * - Le setInterval(100ms) ne re-render que ce composant
 * - tabular-nums pour éviter le layout shift des chiffres mono-espacement
 *
 * @see TimerControls.tsx — contrôles PO (presets, start/stop/reset)
 * @see roomStore.ts — logique serveur (startTimer, stopTimer, etc.)
 */

import React, { useState, useEffect, useRef } from 'react';

interface ChronometerProps {
  timerDuration: number;          // Durée configurée en ms
  timerStartedAt?: number;        // Timestamp serveur du démarrage (undefined = stoppé)
  timerStoppedRemaining?: number; // Temps restant au moment du stop (peut être < 0)
  isRunning: boolean;             // Raccourci pour !!timerStartedAt
  compact?: boolean;              // Mode compact pour l'intégration dans TimerControls
}

/** Formate des millisecondes en MM:SS ou -MM:SS */
function formatTime(ms: number): string {
  const negative = ms < 0;
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${negative ? '-' : ''}${mm}:${ss}`;
}

export default React.memo(function Chronometer({
  timerDuration,
  timerStartedAt,
  timerStoppedRemaining,
  isRunning,
  compact = false,
}: ChronometerProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (isRunning && timerStartedAt) {
      return timerDuration - (Date.now() - timerStartedAt);
    }
    return timerStoppedRemaining ?? timerDuration;
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isRunning && timerStartedAt) {
      // Tick toutes les 100ms pour un affichage fluide sans surcharger le CPU
      const tick = () => {
        setRemaining(timerDuration - (Date.now() - timerStartedAt));
      };
      tick(); // Calcul immédiat, pas d'attente des 100ms initiales
      intervalRef.current = setInterval(tick, 100);
    } else {
      // Timer stoppé : afficher le remaining figé, ou la durée complète si jamais démarré
      setRemaining(timerStoppedRemaining ?? timerDuration);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timerStartedAt, timerDuration, timerStoppedRemaining]);

  // Seuils visuels : vert (> 10s) → orange (≤ 10s) → rouge + pulse (< 0)
  const isNegative = remaining < 0;
  const isWarning = remaining > 0 && remaining <= 10000;

  const colorClass = isNegative
    ? 'text-red-400'
    : isWarning
      ? 'text-orange-400'
      : 'text-green-400';

  const pulseClass = isNegative ? 'animate-pulse' : '';

  if (compact) {
    return (
      <span className={`font-mono font-bold ${colorClass} ${pulseClass}`}>
        {formatTime(remaining)}
      </span>
    );
  }

  return (
    <div className={`font-mono text-2xl font-bold tabular-nums ${colorClass} ${pulseClass}`}>
      {formatTime(remaining)}
    </div>
  );
});
