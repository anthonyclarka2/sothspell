/**
 * The harness adapter contract lands with the OpenCode plugin in Phase 7. The
 * package is reserved now because the web app and the plugin will consume the
 * same tour and run model rather than forking the player.
 */
export interface HarnessContract {
  readonly phase: 7;
}
