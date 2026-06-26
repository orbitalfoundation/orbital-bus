# Releasing

Maintainer notes for cutting a release of the `@orbitalfoundation` packages.

Both packages publish under the `@orbitalfoundation` scope. `bus` depends on `utils`, so when both
have changed, publish `utils` first.

1. Bump the version of each changed package (and run `npm install --package-lock-only` to sync the
   lockfile). A docs-only change to a single package only needs that package bumped.
2. Authenticate with a token that has write access to the `@orbitalfoundation` org. An **Automation**
   token is simplest — it bypasses the 2FA/OTP prompt that interactive publishing requires.
3. Publish the changed packages:

   ```sh
   npm publish --workspace @orbitalfoundation/utils   # only if utils changed
   npm publish --workspace @orbitalfoundation/bus
   ```

   Scoped packages publish public via each package's `publishConfig.access: public`.
