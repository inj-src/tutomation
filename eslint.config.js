// @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/method-signature-style": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/require-await": "off",
      "import/consistent-type-specifier-style": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    ignores: ["dist/**", "runs/**", ".auth/**", "eslint.config.js"],
  },
]
