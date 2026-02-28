'use client';

/**
 * Composant DeckSettings - Paramètres du deck de cartes
 * Permet au PO d'uploader des images personnalisées pour les cartes
 */

import { useState, useRef } from 'react';
import { useSocket } from '@/contexts/SocketContext';
import { useRoom } from '@/hooks/useRoom';

interface DeckSettingsProps {
  onClose: () => void;
}

export default function DeckSettings({ onClose }: DeckSettingsProps) {
  const { uploadImage } = useSocket();
  const { deck } = useRoom();
  const allowUploads = process.env.NEXT_PUBLIC_ALLOW_UPLOADS !== 'false';

  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  if (!deck || !allowUploads) return null;

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'front' | 'back',
    cardValue?: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérification du type
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Format non supporté. Utilisez PNG, JPG ou WEBP.');
      return;
    }

    // Vérification de la taille (2 Mo)
    if (file.size > 2 * 1024 * 1024) {
      setError('L\'image ne doit pas dépasser 2 Mo.');
      return;
    }

    setError(null);
    setUploading(type === 'back' ? 'back' : cardValue || null);

    try {
      const url = await uploadImage(type, cardValue, file);
      if (!url) {
        setError('Erreur lors de l\'upload');
      }
    } catch (err) {
      setError('Erreur lors de l\'upload');
    } finally {
      setUploading(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerUpload = (type: 'front' | 'back', cardValue?: string) => {
    setSelectedCard(type === 'back' ? 'back' : cardValue || null);
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Personnaliser les cartes
          </h3>
          <button
            onClick={onClose}
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
            onChange={(e) => {
              if (selectedCard === 'back') {
                handleFileSelect(e, 'back');
              } else if (selectedCard) {
                handleFileSelect(e, 'front', selectedCard);
              }
            }}
          />

          {/* Dos de carte */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Dos des cartes (commun)</h4>
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
                    alt="Dos de carte"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-500 text-xs p-2">
                    Aucune image
                  </div>
                )}
              </div>
              <button
                onClick={() => triggerUpload('back')}
                disabled={uploading === 'back'}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${uploading === 'back'
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-poker-gold text-gray-900 hover:bg-yellow-500'
                  }
                `}
              >
                {uploading === 'back' ? 'Upload...' : 'Changer l\'image'}
              </button>
            </div>
          </div>

          {/* Recto des cartes */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recto des cartes</h4>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {deck.cards.map((card) => (
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

                  {/* Bouton upload */}
                  <button
                    onClick={() => triggerUpload('front', card.value)}
                    disabled={uploading === card.value}
                    className={`
                      text-[10px] px-2 py-1 rounded transition-colors
                      ${uploading === card.value
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }
                    `}
                  >
                    {uploading === card.value ? '...' : 'Upload'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Instructions:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Formats acceptes: PNG, JPG, WEBP</li>
              <li>Taille maximum: 2 Mo par image</li>
              <li>Les images sont partagees avec tous les participants</li>
              <li>Le dos est commun a toutes les cartes</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-500 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
