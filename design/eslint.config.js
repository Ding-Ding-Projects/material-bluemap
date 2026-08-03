import tseslint from "typescript-eslint";

export default tseslint.config(
    // `release/` holds packaged installers. Linting an unpacked Electron app means
    // linting a minified renderer bundle, which produced 3334 errors in a tree that
    // was otherwise clean. It is gitignored, but eslint does not read gitignore.
    {
        ignores: [
            "**/dist/**",
            "**/out/**",
            "**/release/**",
            "**/node_modules/**",
            "**/coverage/**",
        ],
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
);
