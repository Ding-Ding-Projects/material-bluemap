/**
 * Environment overrides that must never influence gh's credential-store operations.
 *
 * `GH_TOKEN` and `GITHUB_TOKEN` take precedence over gh's stored github.com account;
 * their enterprise equivalents do the same on enterprise hosts. `GH_HOST` can redirect an
 * unqualified inventory call, and `GH_DEBUG` can emit auth diagnostics. Account listing,
 * switching, credential storage, and identity proof all omit this same list, while the
 * process runner enforces case-insensitive matching. `GH_CONFIG_DIR` deliberately remains:
 * it names the user's real gh store rather than overriding its active credential.
 */
export const GH_CLI_AUTH_ENVIRONMENT = [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GH_ENTERPRISE_TOKEN",
    "GITHUB_ENTERPRISE_TOKEN",
    "GH_HOST",
    "GH_DEBUG",
] as const;
