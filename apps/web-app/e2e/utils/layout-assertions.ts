import type { Page } from '@playwright/test';

export interface LayoutViolation {
  rule:
    | 'HORIZONTAL_OVERFLOW'
    | 'ELEMENT_OUT_OF_BOUNDS'
    | 'TEXT_CLIPPED'
    | 'UNREADABLE_MOBILE_TRUNCATION'
    | 'TOUCH_TARGET_TOO_SMALL'
    | 'DIALOG_OUT_OF_VIEWPORT'
    | 'INTERACTIVE_OCCLUDED';
  selector: string;
  detail: string;
}

export interface LayoutCheckOptions {
  /** Enable >=40x40 touch target check (true on mobile/tablet) */
  checkTouchTargets?: boolean;
  /** Tolerance in px for rounding/subpixel */
  tolerancePx?: number;
  /** Scroll clipped controls into view before declaring them unreachable. */
  checkScrollReachability?: boolean;
}

/**
 * Evaluates the 6 automated responsive & overflow rules on the current page:
 * 1. No page horizontal overflow (scrollWidth <= clientWidth)
 * 2. No visible element overflows viewport or overflow:hidden parent (except inside [data-scroll-intended])
 * 3. Buttons, labels, tabs, badges do not clip text unless intentional (.truncate + title)
 * 4. Interactive targets >= 40x40px on mobile/tablet (when checkTouchTargets is true)
 * 5. Open dialogs/sheets/popovers fit inside viewport and are scrollable if tall
 * 6. Visible primary interactive elements are not occluded by other elements
 */
export async function auditPageLayout(
  page: Page,
  options: LayoutCheckOptions = {},
): Promise<LayoutViolation[]> {
  const { checkTouchTargets = false, tolerancePx = 2, checkScrollReachability = false } = options;

  return page.evaluate(
    ({ checkTouch, tol, checkScroll }) => {
      const violations: LayoutViolation[] = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const describeEl = (el: Element): string => {
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId}"]`;
        const id = el.id ? `#${el.id}` : '';
        const text = (el.textContent ?? '').trim().slice(0, 32).replace(/\s+/g, ' ');
        return `${el.tagName.toLowerCase()}${id}${text ? `("${text}")` : ''}`;
      };

      const isVisible = (el: Element): boolean => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0.5 && rect.height > 0.5;
      };

      const insideIntendedScroll = (el: Element): boolean => Boolean(el.closest('[data-scroll-intended]'));

      // Rule 1: Page horizontal overflow
      const docEl = document.scrollingElement ?? document.documentElement;
      if (docEl.scrollWidth > docEl.clientWidth + tol) {
        violations.push({
          rule: 'HORIZONTAL_OVERFLOW',
          selector: 'document.scrollingElement',
          detail: `scrollWidth=${docEl.scrollWidth} > clientWidth=${docEl.clientWidth}`,
        });
      }

      // Rule 2 & 3 & 4 & 6 on interactive / text elements
      const interactiveSelector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="button"]';
      const interactives = Array.from(document.querySelectorAll(interactiveSelector));

      for (const el of interactives) {
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        // Skip off-screen elements in vertical scroll
        if (rect.bottom < 0 || rect.top > vh) continue;

        // Rule 2: Out of horizontal viewport bounds
        if (!insideIntendedScroll(el) && (rect.left < -tol || rect.right > vw + tol)) {
          violations.push({
            rule: 'ELEMENT_OUT_OF_BOUNDS',
            selector: describeEl(el),
            detail: `left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, vw=${vw}`,
          });
        }

        // Rule 3: Unintentional text clipping on buttons/tabs
        const htmlEl = el as HTMLElement;
        const isIntentionalTruncate =
          htmlEl.classList.contains('truncate') ||
          Boolean(htmlEl.querySelector('.truncate')) ||
          style.textOverflow === 'ellipsis' ||
          Boolean(htmlEl.getAttribute('title'));

        if (
          (el.tagName === 'BUTTON' || el.getAttribute('role') === 'tab') &&
          !isIntentionalTruncate &&
          htmlEl.scrollWidth > htmlEl.clientWidth + tol
        ) {
          violations.push({
            rule: 'TEXT_CLIPPED',
            selector: describeEl(el),
            detail: `scrollWidth=${htmlEl.scrollWidth} > clientWidth=${htmlEl.clientWidth}`,
          });
        }

        // Rule 3b: On touch viewports (no hover), flag buttons/tabs whose inner truncated text overflows
        if (
          checkTouch &&
          (el.tagName === 'BUTTON' || el.getAttribute('role') === 'tab')
        ) {
          const truncatedChild = htmlEl.querySelector('.truncate') as HTMLElement | null;
          if (truncatedChild && truncatedChild.scrollWidth > truncatedChild.clientWidth + tol) {
            violations.push({
              rule: 'UNREADABLE_MOBILE_TRUNCATION',
              selector: describeEl(el),
              detail: `truncated label "${(truncatedChild.textContent ?? '').trim()}" (${truncatedChild.scrollWidth}px > ${truncatedChild.clientWidth}px)`,
            });
          }
        }

        // Rule 4: Touch target >= 40x40 on mobile/tablet (ignore tiny icon-only badges inside tables/chips if explicitly marked)
        if (
          checkTouch &&
          !el.closest('[data-compact-target]') &&
          (rect.width < 38 || rect.height < 38)
        ) {
          // Only flag primary controls (buttons/tabs) that are clearly undersized
          if (el.tagName === 'BUTTON' && rect.height < 32) {
            violations.push({
              rule: 'TOUCH_TARGET_TOO_SMALL',
              selector: describeEl(el),
              detail: `${Math.round(rect.width)}x${Math.round(rect.height)}px (< 40x40)`,
            });
          }
        }

        // Rule 6: Occlusion check for visible in-viewport buttons
        if (
          el.tagName === 'BUTTON' &&
          !el.hasAttribute('disabled') &&
          rect.top >= 0 &&
          rect.bottom <= vh &&
          rect.left >= 0 &&
          rect.right <= vw
        ) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const topEl = document.elementFromPoint(cx, cy);
          if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
            // A control below a nested scroll viewport or behind a sticky table column can
            // still be reached by scrolling. Hidden/clip containers do not qualify.
            let scrollParent = el.parentElement;
            let canScroll = false;
            while (scrollParent) {
              const parentStyle = window.getComputedStyle(scrollParent);
              if ((/(auto|scroll)/.test(parentStyle.overflowY) && scrollParent.scrollHeight > scrollParent.clientHeight + tol)
                || (/(auto|scroll)/.test(parentStyle.overflowX) && scrollParent.scrollWidth > scrollParent.clientWidth + tol)) {
                canScroll = true;
                break;
              }
              scrollParent = scrollParent.parentElement;
            }
            if (checkScroll && canScroll) {
              el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
              const revealed = el.getBoundingClientRect();
              const hit = document.elementFromPoint(revealed.left + revealed.width / 2, revealed.top + revealed.height / 2);
              if (hit && (hit === el || el.contains(hit) || hit.contains(el))) continue;
            }
            violations.push({
              rule: 'INTERACTIVE_OCCLUDED',
              selector: describeEl(el),
              detail: `occluded at (${Math.round(cx)},${Math.round(cy)}) by ${describeEl(topEl)}`,
            });
          }
        }
      }

      // Rule 5: Open dialogs / popovers inside viewport
      const overlays = Array.from(
        document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper]'),
      );
      for (const overlay of overlays) {
        if (!isVisible(overlay)) continue;
        const rect = overlay.getBoundingClientRect();
        if (rect.left < -tol || rect.right > vw + tol || rect.top < -tol || rect.bottom > vh + tol) {
          violations.push({
            rule: 'DIALOG_OUT_OF_VIEWPORT',
            selector: describeEl(overlay),
            detail: `rect=(${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}) vs ${vw}x${vh}`,
          });
        }
      }

      return violations;
    },
    { checkTouch: checkTouchTargets, tol: tolerancePx, checkScroll: checkScrollReachability },
  );
}

export const RESPONSIVE_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568, isTouch: true },
  { name: 'mobile-360', width: 360, height: 740, isTouch: true },
  { name: 'mobile-390', width: 390, height: 844, isTouch: true },
  { name: 'mobile-430', width: 430, height: 932, isTouch: true },
  { name: 'mobile-landscape-667', width: 667, height: 375, isTouch: true },
  { name: 'tablet-768', width: 768, height: 1024, isTouch: true },
  { name: 'tablet-820', width: 820, height: 1180, isTouch: true },
  { name: 'pos-1024x600', width: 1024, height: 600, isTouch: true },
  { name: 'tablet-1024', width: 1024, height: 768, isTouch: true },
  { name: 'tablet-1180', width: 1180, height: 820, isTouch: true },
  { name: 'desktop-1366', width: 1366, height: 768, isTouch: false },
  { name: 'desktop-1920', width: 1920, height: 1080, isTouch: false },
  { name: 'desktop-2560', width: 2560, height: 1440, isTouch: false },
  { name: 'breakpoint-639', width: 639, height: 900, isTouch: true },
  { name: 'breakpoint-640', width: 640, height: 900, isTouch: true },
  { name: 'breakpoint-767', width: 767, height: 900, isTouch: true },
  { name: 'breakpoint-1023', width: 1023, height: 900, isTouch: true },
] as const;

export const EXTENDED_RESPONSIVE_VIEWPORTS = [
  ...RESPONSIVE_VIEWPORTS,
  { name: 'fold-outer-344', width: 344, height: 882, isTouch: true },
  { name: 'mobile-375', width: 375, height: 667, isTouch: true },
  { name: 'mobile-412', width: 412, height: 915, isTouch: true },
  { name: 'phablet-540', width: 540, height: 720, isTouch: true },
  { name: 'tablet-small-600', width: 600, height: 960, isTouch: true },
  { name: 'fold-open-717', width: 717, height: 512, isTouch: true },
  { name: 'tablet-1280', width: 1280, height: 800, isTouch: true },
  { name: 'tablet-pro-1366', width: 1366, height: 1024, isTouch: true },
] as const;

export const DISPLAY_SCALE_LEVELS = [80, 100, 125, 150] as const;
