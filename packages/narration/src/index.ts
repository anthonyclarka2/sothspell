/**
 * Narration adapters land in Phase 5. Phase 1 keeps the package boundary so the
 * player's timing seam does not grow a speech dependency by accident.
 */
export interface NarrationContract {
  readonly phase: 5;
}
