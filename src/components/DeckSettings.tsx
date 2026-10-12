'use client';

/**
 * Composant DeckSettings - Paramètres du deck de cartes de la room
 * Permet au PO d'importer ou de retirer des images personnalisées (dos commun, recto par carte).
 * Les modifications sont propres à la room (non persistées dans le compte).
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/contexts/SocketContext';
import { useRoom } from '@/hooks/useRoom';
import { removeDeckImage, type DeckImageTarget } from '@/lib/deckImages';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

interface DeckSettingsProps {
  onClose: () => void;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 Mo
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Clé d'état « envoi en cours » d'une cible */
function targetKey(target: DeckImageTarget): string {
  return target.type === 'back' ? 'back' : `front:${target.cardValue}`;
}

export default function DeckSettings({ onClose }: DeckSettingsProps) {
  const t = useTranslations('deckSettings');
  const tCommon = useTranslations('common');
  const { uploadImage, updateDeck } = useSocket();
  const { deck, isPO } = useRoom();
  const { allowUploads } = useRuntimeConfig();

  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<DeckImageTarget | null>(null);

  // Fermeture avec Échap
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!deck || !isPO || !allowUploads) return null;

  const setTargetUploading = (target: DeckImageTarget, active: boolean) => {
    setUploading((prev) => {
      const next = new Set(prev);
      if (active) next.add(targetKey(target));
      else next.delete(targetKey(target));
      return next;
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    const target = targetRef.current;
    if (!file || !target) return;

    // Vérification du type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('unsupportedFormat'));
      input.value = '';
      return;
    }

    // Vérification de la taille (2 Mo)
    if (file.size > MAX_IMAGE_SIZE) {
      setError(t('imageTooLarge'));
      input.value = '';
      return;
    }

    setError(null);
    setTargetUploading(target, true);

    try {
      const url = target.type === 'back'
        ? await uploadImage('back', undefined, file)
        : await uploadImage('front', target.cardValue, file);
      if (!url) {
        setError(t('uploadError'));
      }
    } catch {
      setError(t('uploadError'));
    } finally {
      setTargetUploading(target, false);
      input.value = '';
    }
  };

  const triggerUpload = (target: DeckImageTarget) => {
    targetRef.current = target;
    fileInputRef.current?.click();
  };

  // La mise à jour revient via room:updated
  const handleRemove = (target: DeckImageTarget) => {
    setError(null);
    updateDeck(removeDeckImage(deck, target));
  };

  const backTarget: DeckImageTarget = { type: 'back' };
  const backUploading = uploading.has(targetKey(backTarget));

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('title')}
          </h3>
          <button
            onClick={onClose}
            aria-label={tCommon('close')}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Erreur */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Input file caché */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Dos de carte */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('cardBack')}</h4>
            <div className="flex items-center gap-4">
              <div
                className={`
                  w-20 h-28 rounded-lg border-2 border-dashed
                  ${deck.backImageUrl ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'}
                  flex items-center justify-center overflow-hidden
                  bg-gray-100 dark:bg-gray-700
                `}
              >
                {deck.backImageUrl ? (
                  <img
                    src={deck.backImageUrl}
                    alt={t('backAlt')}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-500 text-xs p-2">
                    {t('noImage')}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => triggerUpload(backTarget)}
                    disabled={backUploading}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${backUploading
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-poker-gold text-gray-900 hover:bg-yellow-500'
                      }
                    `}
                  >
                    {backUploading ? t('uploading') : t('changeImage')}
                  </button>
                  {deck.backImageUrl && (
                    <button
                      onClick={() => handleRemove(backTarget)}
                      disabled={backUploading}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                    >
                      {t('remove')}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('backOverridesUsers')}</p>
              </div>
            </div>
          </div>

          {/* Recto des cartes */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('cardFront')}</h4>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {deck.cards.map((card) => {
                const target: DeckImageTarget = { type: 'front', cardValue: card.value };
                const isUploading = uploading.has(targetKey(target));
                return (
                  <div
                    key={card.value}
                    className="flex flex-col items-center"
                  >
                    {/* Aperçu de la carte */}
                    <div
                      className={`
                        w-14 h-20 rounded-lg border-2
                        ${card.frontImageUrl ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'}
                        flex items-center justify-center overflow-hidden
                        bg-white
                        mb-2
                      `}
                    >
                      {card.frontImageUrl ? (
                        <img
                          src={card.frontImageUrl}
                          alt={card.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold text-gray-800">{card.label}</span>
                      )}
                    </div>

                    {/* Boutons importer / retirer */}
                    <button
                      onClick={() => triggerUpload(target)}
                      disabled={isUploading}
                      className={`
                        text-[10px] px-2 py-1 rounded transition-colors
                        ${isUploading
                          ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }
                      `}
                    >
                      {isUploading ? '...' : t('upload')}
                    </button>
                    {card.frontImageUrl && (
                      <button
                        onClick={() => handleRemove(target)}
                        disabled={isUploading}
                        className="mt-1 text-[10px] px-2 py-1 rounded transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                      >
                        {t('remove')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{t('instructions')}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('acceptedFormats')}</li>
              <li>{t('maxSize')}</li>
              <li>{t('sharedWithAll')}</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-500 transition-colors"
          >
            {tCommon('close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
