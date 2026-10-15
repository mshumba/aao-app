import { createContext, useContext } from "react";

/**
 * Marks a day of a path done, without the sign-up gate, so the player can
 * call it when a day's sermon has been watched (even docked, with the
 * sermon's page closed). Only the next day due on a path the viewer is on
 * is marked; returns whether it was. LearningProvider provides it.
 *
 * Its own module, importing only React: the player sits under the kit and
 * ui modules, and importing LearningProvider there would load them in a
 * cycle.
 */
export const CompleteDayContext = createContext<(pathId: string, day: number) => boolean>(() => false);

export function useCompleteDay() {
  return useContext(CompleteDayContext);
}
