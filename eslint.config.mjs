import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    ignores: ["dist/", ".next/", "node_modules/", "coverage/"],
  },
  {
    rules: {
      // Patterns React courants — à corriger progressivement
      // useCallback/useEffect déclarés avant leurs dépendances (hoisting)
      "react-hooks/immutability": "warn",
      // setState dans useEffect pour l'init au mount / data fetching — patterns légitimes pré-compiler
      "react-hooks/set-state-in-effect": "off",
      // Ref synchronisée pendant le render (pattern courant pre-React 19 compiler)
      "react-hooks/refs": "warn",
      // <img> vs next/image — les images dynamiques (avatars, uploads) ne passent pas par next/image
      "@next/next/no-img-element": "off",
    },
  },
];
