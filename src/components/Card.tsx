'use client';

/**
 * Composant Card - Carte de Planning Poker
 * Rendu dynamique : chiffre en couleur utilisateur + logo
 * Cartes spéciales (? et café) : logo seul centré
 */

import React, { useMemo } from 'react';
import { CardConfig } from '@/types';
import { getCardBackUrl, getCardLogoUrl, isSpecialCard } from '@/lib/cardImages';

interface CardProps {
  card: CardConfig;
  isSelected?: boolean;
  isRevealed?: boolean;
  isBack?: boolean;
  backImageUrl?: string;
  cardColor?: string; // Couleur hex de l'utilisateur
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  noFlip?: boolean;
}

export default React.memo(function Card({
  card,
  isSelected = false,
  isRevealed = true,
  isBack = false,
  backImageUrl,
  cardColor,
  size = 'md',
  onClick,
  disabled = false,
  className = '',
  noFlip = false,
}: CardProps) {
  // Dimensions selon la taille
  const dimensions = useMemo(() => {
    switch (size) {
      case 'sm':
        return { width: 'w-12', height: 'h-16', text: 'text-xs', bigText: 'text-lg', cornerText: 'text-[6px]', logoSize: 'w-7 h-7', specialLogoSize: 'w-11 h-11' };
      case 'lg':
        return { width: 'w-24', height: 'h-32', text: 'text-lg', bigText: 'text-4xl', cornerText: 'text-xs', logoSize: 'w-16 h-16', specialLogoSize: 'w-24 h-24' };
      default:
        return { width: 'w-16', height: 'h-24', text: 'text-sm', bigText: 'text-3xl', cornerText: 'text-[8px]', logoSize: 'w-10 h-10', specialLogoSize: 'w-16 h-16' };
    }
  }, [size]);

  // URL du dos (mémorisée pour éviter un tirage aléatoire à chaque rendu)
  const computedBackUrl = useMemo(() => backImageUrl || getCardBackUrl(), [backImageUrl]);

  // Affiche le dos ou le recto
  const showBack = isBack || !isRevealed;

  // Couleur effective
  const color = cardColor || '#3B82F6';

  // Contenu du recto de la carte
  const renderFront = () => {
    const special = isSpecialCard(card.value);
    // Logo custom ou logo par défaut
    const logoUrl = card.frontImageUrl || getCardLogoUrl(card.value);

    if (special) {
      // Cartes spéciales : logo centré + symbole dans les 4 coins en couleur utilisateur
      return (
        <div className="w-full h-full flex items-center justify-center bg-white dark:bg-gray-700 relative p-0.5">
          <span className={`absolute top-0.5 left-0.5 ${dimensions.cornerText} font-bold leading-none`} style={{ color }}>{card.label}</span>
          <span className={`absolute top-0.5 right-0.5 ${dimensions.cornerText} font-bold leading-none`} style={{ color }}>{card.label}</span>
          <span className={`absolute bottom-0.5 left-0.5 ${dimensions.cornerText} font-bold leading-none rotate-180`} style={{ color }}>{card.label}</span>
          <span className={`absolute bottom-0.5 right-0.5 ${dimensions.cornerText} font-bold leading-none rotate-180`} style={{ color }}>{card.label}</span>
          <img src={logoUrl} alt={card.label} className={`${dimensions.specialLogoSize} object-contain`} referrerPolicy="no-referrer" />
        </div>
      );
    }

    // Cartes numériques : 4 coins + chiffre gros haut-centre + logo bas-centre
    return (
      <div className="w-full h-full flex flex-col items-center justify-between bg-white dark:bg-gray-700 relative p-0.5">
        {/* Coins */}
        <span className={`absolute top-0.5 left-0.5 ${dimensions.cornerText} font-bold leading-none`} style={{ color }}>{card.label}</span>
        <span className={`absolute top-0.5 right-0.5 ${dimensions.cornerText} font-bold leading-none`} style={{ color }}>{card.label}</span>
        <span className={`absolute bottom-0.5 left-0.5 ${dimensions.cornerText} font-bold leading-none rotate-180`} style={{ color }}>{card.label}</span>
        <span className={`absolute bottom-0.5 right-0.5 ${dimensions.cornerText} font-bold leading-none rotate-180`} style={{ color }}>{card.label}</span>

        {/* Chiffre central haut */}
        <div className="flex-1 flex items-center justify-center">
          <span className={`${dimensions.bigText} font-bold`} style={{ color }}>{card.label}</span>
        </div>

        {/* Logo bas */}
        <div className="flex items-center justify-center pb-0.5">
          <img src={logoUrl} alt="" className={`${size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-12 h-12' : 'w-7 h-7'} object-contain`} referrerPolicy="no-referrer" />
        </div>
      </div>
    );
  };

  // Rendu du dos
  const renderBack = () => (
    <div
      className={`
        ${dimensions.width} ${dimensions.height}
        rounded-lg shadow-lg
        flex items-center justify-center
        border-2 border-gray-300 dark:border-gray-500
        overflow-hidden
      `}
      style={{ backgroundColor: color }}
    >
      {computedBackUrl ? (
        <img src={computedBackUrl} alt="Dos de carte" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-full h-full flex items-center justify-center relative">
          <div className="absolute inset-1 border border-white/30 rounded-md" />
          <div className="absolute inset-2 border border-white/20 rounded-sm" />
          <div className="text-2xl">🎴</div>
        </div>
      )}
    </div>
  );

  // Rendu du recto
  const renderFrontCard = () => (
    <div
      className={`
        ${dimensions.width} ${dimensions.height}
        rounded-lg shadow-lg
        flex items-center justify-center
        border-2
        ${isSelected ? 'border-poker-gold ring-2 ring-poker-gold' : 'border-gray-300 dark:border-gray-500'}
        overflow-hidden
        transition-all duration-200
        ${onClick && !disabled ? 'hover:shadow-xl hover:-translate-y-1' : ''}
        ${disabled ? 'opacity-50' : ''}
      `}
    >
      {renderFront()}
    </div>
  );

  // Mode sans flip
  if (noFlip) {
    return (
      <div
        className={`
          ${dimensions.width} ${dimensions.height}
          ${onClick && !disabled ? 'cursor-pointer' : ''}
          ${className}
        `}
        onClick={!disabled ? onClick : undefined}
      >
        {showBack ? renderBack() : renderFrontCard()}
      </div>
    );
  }

  // Mode flip
  return (
    <div
      className={`
        card-flip
        ${dimensions.width} ${dimensions.height}
        ${onClick && !disabled ? 'cursor-pointer' : ''}
        ${className}
      `}
      onClick={!disabled ? onClick : undefined}
    >
      <div
        className={`
          card-flip-inner
          ${showBack ? '' : 'flipped'}
          transition-transform duration-500
        `}
        style={{ transform: showBack ? 'rotateY(0deg)' : 'rotateY(180deg)' }}
      >
        {/* Dos de la carte */}
        <div className={`card-face card-back`}>
          {renderBack()}
        </div>

        {/* Recto de la carte */}
        <div className={`card-face card-front`}>
          {renderFrontCard()}
        </div>
      </div>
    </div>
  );
});

/**
 * Mini carte pour affichage compact
 */
export const MiniCard = React.memo(function MiniCard({
  value,
  label,
  cardColor,
}: {
  value: string;
  label: string;
  frontImageUrl?: string; // conservé pour compatibilité mais ignoré
  cardColor?: string;
}) {
  const color = cardColor || '#3B82F6';

  return (
    <div className="w-8 h-10 rounded bg-white dark:bg-gray-700 flex items-center justify-center text-xs font-bold border border-gray-300 dark:border-gray-500 shadow-sm">
      <span style={{ color }}>{label}</span>
    </div>
  );
});
