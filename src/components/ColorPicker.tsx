'use client';

/**
 * Composant ColorPicker - Sélecteur de couleur pour les cartes
 * Affiche des pastilles de couleurs prédéfinies + un input color pour choix libre
 */

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

const PRESET_COLORS = [
  '#3B82F6', // bleu
  '#EF4444', // rouge
  '#F97316', // orange
  '#22C55E', // vert
  '#8B5CF6', // violet
  '#EC4899', // rose
  '#14B8A6', // teal
  '#F59E0B', // ambre
];

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`
              w-8 h-8 rounded-full border-2 transition-all
              ${value === color ? 'border-gray-900 dark:border-white scale-110 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : 'border-transparent hover:scale-105'}
            `}
            style={{
              backgroundColor: color,
            }}
            title={color}
          />
        ))}
        {/* Custom color picker */}
        <label
          className={`
            w-8 h-8 rounded-full border-2 cursor-pointer overflow-hidden transition-all
            ${!PRESET_COLORS.includes(value) ? 'border-gray-900 dark:border-white scale-110 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : 'border-gray-300 dark:border-gray-600 hover:scale-105'}
          `}
          style={{
            backgroundColor: !PRESET_COLORS.includes(value) ? value : undefined,
          }}
          title={value}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="opacity-0 w-full h-full cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}
