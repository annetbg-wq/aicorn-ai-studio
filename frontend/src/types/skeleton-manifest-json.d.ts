/**
 * Transitional compile-time bridge while SkeletonRegistry still imports the
 * manifest JSON files directly using its legacy view.
 *
 * Canonical runtime validation is performed by SkeletonManifestContract and
 * compileSkeletonContract(). This declaration prevents TypeScript's inferred
 * JSON literal ownership shape from rejecting the temporary legacy Registry
 * cast before that Registry consumer is removed.
 *
 * Delete this file together with the legacy SkeletonRegistry manifest view.
 */
declare module '*skeleton.manifest.json' {
  const manifest: any;
  export default manifest;
}
