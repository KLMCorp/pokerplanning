'use client';

/**
 * Page Mon Compte - Configuration des cartes et de la table
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { DeckConfig, TableConfig } from '@/types';
import { getCardLogoUrl } from '@/lib/cardImages';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';

const DEFAULT_DECK: DeckConfig = {
  cards: [
    { value: '0', label: '0' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '5', label: '5' },
    { value: '8', label: '8' },
    { value: '13', label: '13' },
    { value: '20', label: '20' },
    { value: '40', label: '40' },
    { value: '100', label: '100' },
    { value: '?', label: '?' },
    { value: 'coffee', label: '☕' },
  ],
  backImageUrl: undefined,
};

export default function AccountPage() {
  const router = useRouter();
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const { account, isAuthenticated, isLoading, isServerConnected, logout, uploadDeckImage, deleteDeckImage, uploadAvatar, updateTableConfig, uploadTableImage, updateRoomTtl, maxRoomTtlMinutes } = useAuth();
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [tableImageUploading, setTableImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const tableImageInputRef = useRef<HTMLInputElement>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [roomTtl, setRoomTtl] = useState<number>(account?.roomTtlMinutes || maxRoomTtlMinutes);
  const [ttlSaving, setTtlSaving] = useState(false);

  // Deck de l'utilisateur (ou default)
  const userDeck = account?.deckConfig || DEFAULT_DECK;
  const userTable = account?.tableConfig || {};
  const allowUploads = process.env.NEXT_PUBLIC_ALLOW_UPLOADS !== 'false';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-900 dark:text-white">{tCommon('loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated || !account) {
    return null;
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCard) return;

    if (!isServerConnected) {
      setUploadError(t('sessionExpired'));
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setUploadError(t('unsupportedFormat'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('imageTooLarge'));
      return;
    }

    setUploadError(null);
    setUploading(selectedCard);

    try {
      const type = selectedCard === 'back' ? 'back' : 'front';
      const cardValue = selectedCard === 'back' ? undefined : selectedCard;
      const url = await uploadDeckImage(type, cardValue, file);
      if (!url) {
        setUploadError(t('uploadError'));
      }
    } catch (err) {
      setUploadError(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(null);
      setSelectedCard(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerUpload = (cardKey: string) => {
    if (!isServerConnected) {
      setUploadError(t('sessionExpired'));
      return;
    }
    setSelectedCard(cardKey);
    fileInputRef.current?.click();
  };

  const handleDeleteImage = async (cardKey: string) => {
    if (!isServerConnected) {
      setUploadError(t('sessionExpired'));
      return;
    }

    setUploadError(null);
    setDeleting(cardKey);

    try {
      const type = cardKey === 'back' ? 'back' : 'front';
      const cardValue = cardKey === 'back' ? undefined : cardKey;
      const success = await deleteDeckImage(type, cardValue);
      if (!success) {
        setUploadError(t('deleteError'));
      }
    } catch (err) {
      setUploadError(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setUploadError(t('unsupportedFormat'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('imageTooLarge'));
      return;
    }

    setUploadError(null);
    setAvatarUploading(true);

    try {
      const url = await uploadAvatar(file);
      if (!url) {
        setUploadError(t('avatarUploadError'));
      }
    } catch (err) {
      setUploadError(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleTableImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setUploadError(t('unsupportedFormat'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('imageTooLarge'));
      return;
    }

    setUploadError(null);
    setTableImageUploading(true);

    try {
      const url = await uploadTableImage(file);
      if (!url) {
        setUploadError(t('tableImageUploadError'));
      }
    } catch (err) {
      setUploadError(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTableImageUploading(false);
      if (tableImageInputRef.current) {
        tableImageInputRef.current.value = '';
      }
    }
  };

  const handleTableColorChange = async (feltColor: string, borderColor: string) => {
    const newConfig: TableConfig = {
      ...userTable,
      feltColor,
      borderColor,
    };
    await updateTableConfig(newConfig);
  };

  const handleRemoveTableImage = async () => {
    const newConfig: TableConfig = {
      ...userTable,
      imageUrl: undefined,
    };
    await updateTableConfig(newConfig);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {tCommon('back')}
          </button>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <ThemeToggle size="sm" />
            <button
              onClick={() => router.push('/backlog')}
              className="text-poker-gold hover:text-yellow-500 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {t('backlog')}
            </button>
            <button
              onClick={() => router.push('/profile')}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm flex items-center gap-1"
              title={t('history')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-sm"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Alerte si le serveur ne reconnait pas le compte */}
        <div className={`bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-xl p-4 mb-6 ${isServerConnected ? 'hidden' : 'block'}`}>
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-red-700 dark:text-red-300 font-medium">{t('sessionExpiredTitle')}</h3>
              <p className="text-red-600 dark:text-red-200 text-sm mt-1">
                {t('sessionExpiredMessage')}
              </p>
              <button
                onClick={logout}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>

        {/* Profil */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('myAccount')}</h2>
          <div className="flex items-center gap-4">
            {/* Avatar avec possibilité d'upload */}
            <div className="relative group">
              {allowUploads && (
                <input
                  type="file"
                  ref={avatarInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              )}
              <div
                className={`
                  w-20 h-20 rounded-full overflow-hidden
                  ${allowUploads && isServerConnected ? 'cursor-pointer' : allowUploads ? 'cursor-not-allowed opacity-50' : ''}
                  ${account.avatarUrl ? '' : 'bg-poker-gold/20'}
                  flex items-center justify-center text-4xl
                  border-2 border-transparent ${allowUploads ? 'hover:border-poker-gold' : ''} transition-colors
                `}
                onClick={() => allowUploads && isServerConnected && avatarInputRef.current?.click()}
              >
                {avatarUploading ? (
                  <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <svg className="w-8 h-8 animate-spin text-poker-gold" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : account.avatarUrl ? (
                  <img
                    src={account.avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  account.role === 'po' ? '👔' : '💻'
                )}
              </div>
              {allowUploads && (
                <div
                  className={`absolute inset-0 rounded-full bg-black/50 opacity-0 transition-opacity flex items-center justify-center cursor-pointer ${isServerConnected ? 'group-hover:opacity-100' : 'hidden'}`}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{account.name}</h1>
              <p className="text-gray-500 dark:text-gray-400">{account.email}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                account.role === 'po' ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              }`}>
                {account.role === 'po' ? t('rolePoLabel') : t('roleDeveloper')}
              </span>
              {allowUploads && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('clickAvatarToChange')}</p>}
            </div>
          </div>
        </div>

        {/* Personnalisation des cartes */}
        {allowUploads && <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {t('customizeCards')}
          </h2>

          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className={`mb-4 p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm ${uploadError ? 'block' : 'hidden'}`}>
            {uploadError || ' '}
          </div>

          {/* Dos de carte */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('cardBack')}</h4>
            <div className="flex items-center gap-4">
              <div
                className={`
                  w-20 h-28 rounded-lg border-2 border-dashed
                  ${userDeck.backImageUrl ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'}
                  flex items-center justify-center overflow-hidden
                  bg-gray-100 dark:bg-gray-700
                `}
              >
                {userDeck.backImageUrl ? (
                  <img
                    src={userDeck.backImageUrl}
                    alt="Dos de carte"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-gray-400 dark:text-gray-500 text-xs p-2">
                    {t('noImage')}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => triggerUpload('back')}
                  disabled={uploading === 'back' || deleting === 'back' || !isServerConnected}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-colors
                    ${uploading === 'back' || deleting === 'back' || !isServerConnected
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-amber-400 dark:bg-poker-gold text-gray-900 hover:bg-amber-300 dark:hover:bg-yellow-500'
                    }
                  `}
                >
                  {uploading === 'back' ? t('uploading') : t('change')}
                </button>
                <button
                  onClick={() => handleDeleteImage('back')}
                  disabled={uploading === 'back' || deleting === 'back' || !isServerConnected || !userDeck.backImageUrl}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${!userDeck.backImageUrl ? 'hidden' : ''}
                    ${deleting === 'back' || !isServerConnected
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-red-500 text-white hover:bg-red-600'
                    }
                  `}
                >
                  {deleting === 'back' ? '...' : tCommon('delete')}
                </button>
              </div>
            </div>
          </div>

          {/* Logos des cartes */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('cardLogos')}</h4>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {userDeck.cards.map((card) => {
                const defaultLogoUrl = getCardLogoUrl(card.value);
                const logoUrl = card.frontImageUrl || defaultLogoUrl;
                const hasCustom = !!card.frontImageUrl;

                return (
                  <div
                    key={card.value}
                    className="flex flex-col items-center"
                  >
                    <div
                      className={`
                        w-14 h-14 rounded-lg border-2
                        ${hasCustom ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'}
                        flex items-center justify-center overflow-hidden
                        bg-white dark:bg-gray-700
                        mb-1
                      `}
                    >
                      <img
                        src={logoUrl}
                        alt={card.label}
                        className="w-10 h-10 object-contain"
                      />
                    </div>

                    <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">{card.label}</span>

                    <div className="flex gap-1">
                      <button
                        onClick={() => triggerUpload(card.value)}
                        disabled={uploading === card.value || deleting === card.value || !isServerConnected}
                        className={`
                          text-[10px] px-2 py-1 rounded transition-colors
                          ${uploading === card.value || deleting === card.value || !isServerConnected
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-amber-50 dark:bg-gray-700 text-amber-700 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-gray-600'
                          }
                        `}
                      >
                        {uploading === card.value ? '...' : 'Upload'}
                      </button>
                      <button
                        onClick={() => handleDeleteImage(card.value)}
                        disabled={uploading === card.value || deleting === card.value || !isServerConnected || !hasCustom}
                        className={`
                          text-[10px] px-1.5 py-1 rounded transition-colors
                          ${!hasCustom ? 'hidden' : ''}
                          ${deleting === card.value || !isServerConnected
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-red-500 text-white hover:bg-red-600'
                          }
                        `}
                        title={tCommon('delete')}
                      >
                        {deleting === card.value ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{t('instructions')}:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('acceptedFormats')}</li>
              <li>{t('maxSize')}</li>
              <li>{t('imagesUsedOnRoomCreation')}</li>
            </ul>
          </div>
        </div>}

        {/* Personnalisation de la table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            {t('customizeTable')}
          </h2>

          {allowUploads && (
            <input
              type="file"
              ref={tableImageInputRef}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleTableImageSelect}
            />
          )}

          {/* Aperçu de la table */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('preview')}</h4>
            <div
              className="w-full h-32 rounded-[50%] border-4 flex items-center justify-center overflow-hidden"
              style={{
                background: userTable.imageUrl
                  ? `url(${userTable.imageUrl}) center/cover`
                  : `radial-gradient(ellipse at center, ${userTable.feltColor || '#1a7a3d'} 0%, ${userTable.feltColor ? userTable.feltColor + '99' : '#0d5c2e'} 70%)`,
                borderColor: userTable.borderColor || '#8B4513',
              }}
            >
              <span className="text-white/50 text-sm">{t('tablePreview')}</span>
            </div>
          </div>

          {/* Image de fond */}
          {allowUploads && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('backgroundImage')}</h4>
              <div className="flex items-center gap-4">
                <div
                  className={`
                    w-24 h-16 rounded-lg border-2 border-dashed overflow-hidden
                    ${userTable.imageUrl ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'}
                    flex items-center justify-center bg-gray-100 dark:bg-gray-700
                  `}
                >
                  {userTable.imageUrl ? (
                    <img
                      src={userTable.imageUrl}
                      alt="Table"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-xs">{t('none')}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => isServerConnected && tableImageInputRef.current?.click()}
                    disabled={!isServerConnected || tableImageUploading}
                    className={`
                      px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${!isServerConnected || tableImageUploading
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-amber-400 dark:bg-poker-gold text-gray-900 hover:bg-amber-300 dark:hover:bg-yellow-500'
                      }
                    `}
                  >
                    {tableImageUploading ? t('uploading') : t('change')}
                  </button>
                  <button
                    onClick={handleRemoveTableImage}
                    disabled={!isServerConnected || !userTable.imageUrl}
                    className={`px-3 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors ${!userTable.imageUrl ? 'hidden' : ''}`}
                  >
                    {tCommon('delete')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Couleurs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('feltColor')}</h4>
              <div className="flex gap-2">
                {['#1a7a3d', '#1e3a8a', '#7c2d12', '#4c1d95', '#1f2937'].map((color) => (
                  <button
                    key={color}
                    onClick={() => isServerConnected && handleTableColorChange(color, userTable.borderColor || '#8B4513')}
                    disabled={!isServerConnected}
                    className={`
                      w-8 h-8 rounded-full border-2 transition-transform hover:scale-110
                      ${userTable.feltColor === color ? 'border-white ring-2 ring-poker-gold scale-110' : 'border-transparent'}
                      ${!isServerConnected ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('borderColor')}</h4>
              <div className="flex gap-2">
                {['#8B4513', '#654321', '#2d1b0e', '#d4af37', '#4a4a4a'].map((color) => (
                  <button
                    key={color}
                    onClick={() => isServerConnected && handleTableColorChange(userTable.feltColor || '#1a7a3d', color)}
                    disabled={!isServerConnected}
                    className={`
                      w-8 h-8 rounded-full border-2 transition-transform hover:scale-110
                      ${userTable.borderColor === color ? 'border-white ring-2 ring-poker-gold scale-110' : 'border-transparent'}
                      ${!isServerConnected ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-xs text-gray-500 dark:text-gray-400">
            <p>{t('customizationAppliedOnRoomCreation')}</p>
          </div>
        </div>

        {/* Configuration du TTL des rooms */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('roomTtlTitle')}
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('roomTtlDescription')}
          </p>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('roomTtlLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={15}
                  max={maxRoomTtlMinutes}
                  step={15}
                  value={roomTtl}
                  onChange={(e) => setRoomTtl(parseInt(e.target.value))}
                  disabled={!isServerConnected}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-poker-gold disabled:opacity-50"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white min-w-[80px] text-right">
                  {roomTtl >= 60 ? `${Math.floor(roomTtl / 60)}h${roomTtl % 60 > 0 ? ` ${roomTtl % 60}min` : ''}` : `${roomTtl} min`}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>15 min</span>
                <span>{t('roomTtlMax', { hours: Math.floor(maxRoomTtlMinutes / 60) })}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={async () => {
                setTtlSaving(true);
                await updateRoomTtl(roomTtl);
                setTtlSaving(false);
              }}
              disabled={!isServerConnected || ttlSaving || roomTtl === (account?.roomTtlMinutes || maxRoomTtlMinutes)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${!isServerConnected || ttlSaving || roomTtl === (account?.roomTtlMinutes || maxRoomTtlMinutes)
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-amber-400 dark:bg-poker-gold text-gray-900 hover:bg-amber-300 dark:hover:bg-yellow-500'
                }
              `}
            >
              {ttlSaving ? tCommon('loading') : tCommon('save')}
            </button>
            {account?.roomTtlMinutes && roomTtl !== account.roomTtlMinutes && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('roomTtlCurrent')}: {account.roomTtlMinutes >= 60 ? `${Math.floor(account.roomTtlMinutes / 60)}h${account.roomTtlMinutes % 60 > 0 ? ` ${account.roomTtlMinutes % 60}min` : ''}` : `${account.roomTtlMinutes} min`}
              </span>
            )}
          </div>

          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-xs text-gray-500 dark:text-gray-400">
            <p>{t('roomTtlNote')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
