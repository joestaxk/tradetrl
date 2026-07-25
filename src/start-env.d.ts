/**
 * TanStack Start augments router-core's route options with `server: { handlers }`
 * via declaration merging in @tanstack/start-client-core. That augmentation only
 * applies if the module is in the program — this import puts it there globally,
 * so server routes typecheck without every route file importing Start directly.
 */
import '@tanstack/start-client-core'
