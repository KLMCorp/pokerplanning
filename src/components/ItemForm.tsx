'use client';

/**
 * Composant ItemForm - Formulaire de création/édition d'item
 * Modal pour ajouter ou modifier un item du backlog
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/contexts/SocketContext';

interface ItemFormProps {
  editItem?: { id: string; title: string; description: string } | null;
  onClose: () => void;
}

export default function ItemForm({ editItem, onClose }: ItemFormProps) {
  const t = useTranslations('itemForm');
  const tCommon = useTranslations('common');
  const { createItem, updateItem } = useSocket();

  const [title, setTitle] = useState(editItem?.title ?? '');
  const [description, setDescription] = useState(editItem?.description ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    if (editItem) {
      updateItem(editItem.id, title.trim(), description.trim());
    } else {
      createItem(title.trim(), description.trim());
    }

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editItem ? t('editItem') : t('newItem')}
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

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Titre */}
          <div>
            <label htmlFor="itemTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('title')}
            </label>
            <input
              type="text"
              id="itemTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="itemDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('description')}
            </label>
            <textarea
              id="itemDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={4}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent resize-none"
              maxLength={1000}
            />
          </div>

          {/* Boutons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${title.trim()
                  ? 'bg-poker-gold text-gray-900 hover:bg-yellow-500'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {editItem ? tCommon('save') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
