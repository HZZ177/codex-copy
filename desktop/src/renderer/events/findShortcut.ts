export const APP_FIND_SHORTCUT_EVENT = "keydex:find-shortcut";

export interface AppFindShortcutDetail {
  sourceTarget: EventTarget | null;
}

export function isFindShortcutEvent(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "f" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}
