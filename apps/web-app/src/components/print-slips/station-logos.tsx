import { type KitchenStation } from '@fnb/shared';

export type StationLogoType = 'CHEF_HAT_NOODLE' | 'FRENCH_FRIES' | 'DRINK_CUP';

export const STATION_META: Record<
  KitchenStation,
  {
    title: string;
    logoType: StationLogoType;
  }
> = {
  BEP_NAU: {
    title: 'BẾP NẤU (MÌ CAY)',
    logoType: 'CHEF_HAT_NOODLE',
  },
  BEP_CHIEN: {
    title: 'BẾP CHIÊN',
    logoType: 'FRENCH_FRIES',
  },
  PHA_CHE: {
    title: 'QUẦY NƯỚC UỐNG',
    logoType: 'DRINK_CUP',
  },
};

export interface StationLogoProps {
  logoType: StationLogoType;
  className?: string;
}

export function StationLogo({ logoType, className = 'h-12 w-12' }: StationLogoProps) {
  if (logoType === 'CHEF_HAT_NOODLE') {
    return (
      <svg
        data-testid="station-logo-CHEF_HAT_NOODLE"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Logo Bếp Nấu Mì Cay"
      >
        {/* High-contrast Chef Hat & Spicy Noodle Bowl for 80mm thermal head */}
        <path
          d="M20 26V22C15.5817 22 12 18.4183 12 14C12 9.58172 15.5817 6 20 6C21.8565 6 23.5653 6.63214 24.9204 7.6936C26.7478 5.44262 29.5364 4 32.6667 4C35.797 4 38.5855 5.44262 40.413 7.6936C41.7681 6.63214 43.4768 6 45.3333 6C49.7516 6 53.3333 9.58172 53.3333 14C53.3333 18.4183 49.7516 22 45.3333 22V26H20Z"
          stroke="#000000"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 34H54C54 46.1503 44.1503 56 32 56C19.8497 56 10 46.1503 10 34Z"
          stroke="#000000"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M22 60H42"
          stroke="#000000"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M20 30C22 27 26 27 28 30C30 33 34 33 36 30C38 27 42 27 44 30"
          stroke="#000000"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (logoType === 'FRENCH_FRIES') {
    return (
      <svg
        data-testid="station-logo-FRENCH_FRIES"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Logo Bếp Chiên"
      >
        {/* High-contrast French Fries Box for 80mm thermal head */}
        <path
          d="M18 28V10H24V28M28 28V6H35V28M39 28V12H46V28"
          stroke="#000000"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 28H50L45 58H19L14 28Z"
          stroke="#000000"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M22 36C25 40 39 40 42 36"
          stroke="#000000"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      data-testid="station-logo-DRINK_CUP"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Quầy Nước Uống"
    >
      {/* High-contrast Drink Cup with Straw & Bubbles for 80mm thermal head */}
      <path
        d="M36 6L30 22"
        stroke="#000000"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M14 22H50"
        stroke="#000000"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M18 22L22 58H42L46 22"
        stroke="#000000"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="48" r="2.5" fill="#000000" />
      <circle cx="33" cy="50" r="2.5" fill="#000000" />
      <circle cx="38" cy="47" r="2.5" fill="#000000" />
    </svg>
  );
}
