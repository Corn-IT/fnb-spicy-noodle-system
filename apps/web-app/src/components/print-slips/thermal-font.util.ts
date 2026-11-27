import {
  THERMAL_FONT_OPTIONS,
  ThermalFontFamilySchema,
  resolveThermalFontFamily,
  type ThermalFontFamily,
} from '@fnb/shared';
import './thermal-fonts.css';

export function getTicketFontFamily(ticket: HTMLElement): ThermalFontFamily {
  return ThermalFontFamilySchema.parse(ticket.dataset.thermalFont ?? 'monospace');
}

export async function waitForThermalFont(font: ThermalFontFamily): Promise<void> {
  const option = THERMAL_FONT_OPTIONS.find((entry) => entry.key === font)!;
  if (!option.bundled || !document.fonts) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const faces = await Promise.race([
      Promise.all([400, 700].map((weight) =>
        document.fonts.load(`${weight} 16px "${option.label}"`, 'Mì cay Đặng Ắ ặ ễ ộ ự 0123456789'),
      )),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Không tải được phông chữ ${option.label}`)), 10000);
      }),
    ]);
    if (faces.some((loaded) => loaded.length === 0)) {
      throw new Error(`Không tải được phông chữ ${option.label}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForThermalContainerFonts(container: HTMLElement): Promise<void> {
  const fonts = new Set(Array.from(container.querySelectorAll<HTMLElement>('[data-thermal-font]'))
    .map(getTicketFontFamily));
  await Promise.all(Array.from(fonts, waitForThermalFont));
}

export { resolveThermalFontFamily };
