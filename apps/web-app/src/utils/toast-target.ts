export const TOAST_VIEWPORT_SELECTOR = '[data-toast-viewport="true"]' as const;

export function isToastTarget(target: EventTarget | null | undefined): boolean {
  return target instanceof Element && target.closest(TOAST_VIEWPORT_SELECTOR) !== null;
}

export function isEventFromToastViewport(event: {
  target?: EventTarget | null;
  detail?: { originalEvent?: { target?: EventTarget | null } };
}): boolean {
  return isToastTarget(event.target) || isToastTarget(event.detail?.originalEvent?.target);
}
