import * as React from 'react';

/** Theo dõi một media query (VD: màn thấp, màn hẹp) và cập nhật khi xoay / đổi kích thước. */
export function useMediaQuery(query: string): boolean {
  const getMatch = React.useCallback(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
    [query],
  );
  const [matches, setMatches] = React.useState<boolean>(getMatch);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, [query, getMatch]);

  return matches;
}

/** Máy POS Android có tỉ lệ điểm ảnh cao thường chỉ còn ~540–600px chiều cao CSS. */
export const SHORT_SCREEN_QUERY = '(max-height: 640px)';
/** Dưới mức này (điện thoại) không đủ chỗ cho 3 cột thực đơn + giỏ hàng. */
export const TOO_NARROW_QUERY = '(max-width: 767px)';
