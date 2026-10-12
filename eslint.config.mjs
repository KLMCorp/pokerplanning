import nextConfig from "eslint-config-next";
import reactPackage from "react/package.json" with { type: "json" };

export default [
  ...nextConfig,
  {
    ignores: ["dist/", ".next/", "node_modules/", "coverage/"],
  },
  {
    settings: {
      // ESLint 10 : eslint-plugin-react 7.37 plante en mode "detect" (context.getFilename supprimé).
      // Version React lue depuis le package installé en attendant un eslint-plugin-react compatible ESLint 10.
      react: { version: reactPackage.version },
    },
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
      // Appel impur (Date.now) pendant le render — détecté depuis eslint-plugin-react-hooks 7.1
      "react-hooks/purity": "warn",
      // <img> vs next/image — les images dynamiques (avatars, uploads) ne passent pas par next/image
      "@next/next/no-img-element": "off",
    },
  },
];
