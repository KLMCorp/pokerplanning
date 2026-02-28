'use client';

/**
 * Modal d'authentification - Inscription, Connexion et Mot de passe oublié
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole, AuthType } from '@/types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { register, login, forgotPassword, verifyResetCode, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [authType, setAuthType] = useState<AuthType>('email');
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('dev');
  const [resetCode, setResetCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (!name.trim()) {
          setError(t('nameRequired'));
          setIsLoading(false);
          return;
        }
        if (authType === 'pseudo') {
          if (!pseudo.trim()) {
            setError(t('pseudoRequired'));
            setIsLoading(false);
            return;
          }
          const pseudoRegex = /^[a-zA-Z0-9_-]{3,20}$/;
          if (!pseudoRegex.test(pseudo.trim())) {
            setError(t('pseudoInvalid'));
            setIsLoading(false);
            return;
          }
        }
        const result = await register(
          authType === 'pseudo' ? '' : email,
          password,
          name,
          role,
          authType,
          authType === 'pseudo' ? pseudo : undefined
        );
        if (!result.success) {
          setError(result.error || t('registerError'));
        } else {
          onClose();
        }
      } else if (mode === 'login') {
        if (authType === 'pseudo' && !pseudo.trim()) {
          setError(t('pseudoRequired'));
          setIsLoading(false);
          return;
        }
        const result = await login(
          authType === 'pseudo' ? '' : email,
          password,
          authType,
          authType === 'pseudo' ? pseudo : undefined
        );
        if (!result.success) {
          setError(result.error || t('loginError'));
        } else {
          onClose();
        }
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setError(t('emailRequired'));
          setIsLoading(false);
          return;
        }
        const result = await forgotPassword(email);
        if (result.success) {
          setSuccess(t('resetCodeSent'));
          setMode('reset');
        } else {
          setError(result.error || t('sendEmailError'));
        }
      } else if (mode === 'reset') {
        if (!resetCode.trim()) {
          setError(t('codeRequired'));
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError(t('passwordsDontMatch'));
          setIsLoading(false);
          return;
        }
        if (password.length < 8) {
          setError(t('passwordMinLength'));
          setIsLoading(false);
          return;
        }
        const result = await resetPassword(resetCode, password);
        if (result.success) {
          setSuccess(t('resetSuccess'));
          setTimeout(() => {
            setMode('login');
            setPassword('');
            setConfirmPassword('');
            setResetCode('');
            setSuccess(null);
          }, 2000);
        } else {
          setError(result.error || t('resetError'));
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return t('login');
      case 'register': return t('register');
      case 'forgot': return t('forgotPassword');
      case 'reset': return t('newPassword');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {getTitle()}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Email / Pseudo */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <button
                type="button"
                onClick={() => setAuthType('email')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  authType === 'email'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('authModeEmail')}
              </button>
              <button
                type="button"
                onClick={() => setAuthType('pseudo')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  authType === 'pseudo'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('authModePseudo')}
              </button>
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('yourName')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                  maxLength={30}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('role')}
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('dev')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      role === 'dev'
                        ? 'border-poker-gold bg-poker-gold/20 text-poker-gold'
                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="text-2xl mb-1">💻</div>
                    <div className="text-sm font-medium">{t('developer')}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('po')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      role === 'po'
                        ? 'border-poker-gold bg-poker-gold/20 text-poker-gold'
                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="text-2xl mb-1">👔</div>
                    <div className="text-sm font-medium">{t('poPm')}</div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Champ Email */}
          {(mode === 'login' || mode === 'register') && authType === 'email' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('yourEmail')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                required
              />
            </div>
          )}

          {/* Champ Pseudo */}
          {(mode === 'login' || mode === 'register') && authType === 'pseudo' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('pseudo')}
              </label>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder={t('yourPseudo')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                required
                maxLength={20}
              />
            </div>
          )}

          {/* Warning pseudo */}
          {(mode === 'register') && authType === 'pseudo' && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-700 dark:text-yellow-200 text-sm">
              {t('pseudoWarning')}
            </div>
          )}

          {/* Champ Email pour mot de passe oublié */}
          {mode === 'forgot' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('yourEmail')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                required
              />
            </div>
          )}

          {mode === 'forgot' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('forgotPasswordHint')}
            </p>
          )}

          {mode === 'reset' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('verificationCode')}
              </label>
              <input
                type="text"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('enterCodeReceived')}
              </p>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                required
                minLength={8}
              />
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('newPassword')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('confirmPassword')}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                  required
                  minLength={8}
                />
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-200 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
              isLoading
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-poker-gold text-gray-900 hover:bg-yellow-500'
            }`}
          >
            {isLoading ? tCommon('loading') :
              mode === 'login' ? t('signIn') :
              mode === 'register' ? t('signUp') :
              mode === 'forgot' ? t('sendCode') :
              t('reset')
            }
          </button>
        </form>

        {/* Links */}
        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400 space-y-2">
          {mode === 'login' && (
            <>
              {authType === 'email' && (
                <div>
                  <button onClick={() => switchMode('forgot')} className="text-poker-gold hover:underline">
                    {t('forgotPassword')}
                  </button>
                </div>
              )}
              <div>
                {t('noAccount')}{' '}
                <button onClick={() => switchMode('register')} className="text-poker-gold hover:underline">
                  {t('signUp')}
                </button>
              </div>
            </>
          )}
          {mode === 'register' && (
            <div>
              {t('hasAccount')}{' '}
              <button onClick={() => switchMode('login')} className="text-poker-gold hover:underline">
                {t('signIn')}
              </button>
            </div>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <div>
              <button onClick={() => switchMode('login')} className="text-poker-gold hover:underline">
                {t('backToLogin')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
