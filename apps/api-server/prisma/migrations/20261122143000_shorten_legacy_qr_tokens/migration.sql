-- Convert untouched legacy long QR tokens (>= 24 chars) on physical tables & Takeaway QR config
-- into readable short tokens (e.g. ban01-k7m9, mangve-x4p2) using unambiguous lowercase Base32 suffix.
DO $$
DECLARE
  alphabet CONSTANT TEXT := '23456789abcdefghjkmnpqrstuvwxyz';
  rec RECORD;
  raw_slug TEXT;
  slug_prefix TEXT;
  suffix TEXT;
  candidate TEXT;
  i INT;
  pos INT;
  takeaway_token TEXT;
  takeaway_meta JSONB;
BEGIN
  FOR rec IN
    SELECT id, name
    FROM dining_tables
    WHERE status <> 'DELETED'
      AND char_length(qr_token) >= 24
    ORDER BY id ASC
  LOOP
    raw_slug := lower(
      regexp_replace(
        translate(
          rec.name,
          'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
        ),
        '[^a-zA-Z0-9]+',
        '',
        'g'
      )
    );
    slug_prefix := COALESCE(NULLIF(left(raw_slug, 16), ''), 'ban');

    LOOP
      suffix := '';
      FOR i IN 1..4 LOOP
        pos := 1 + floor(random() * length(alphabet))::INT;
        IF pos > length(alphabet) THEN
          pos := length(alphabet);
        END IF;
        suffix := suffix || substr(alphabet, pos, 1);
      END LOOP;
      candidate := slug_prefix || '-' || suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM dining_tables WHERE qr_token = candidate
      );
    END LOOP;

    UPDATE dining_tables
    SET qr_token = candidate
    WHERE id = rec.id;
  END LOOP;

  SELECT metadata
  INTO takeaway_meta
  FROM master_data
  WHERE category = 'SYSTEM_CONFIG'
    AND normalized_name = 'takeaway_qr_config'
  LIMIT 1;

  IF takeaway_meta IS NOT NULL THEN
    takeaway_token := COALESCE(takeaway_meta->>'qrToken', '');
    IF char_length(takeaway_token) >= 24 OR takeaway_token = '' THEN
      LOOP
        suffix := '';
        FOR i IN 1..4 LOOP
          pos := 1 + floor(random() * length(alphabet))::INT;
          IF pos > length(alphabet) THEN
            pos := length(alphabet);
          END IF;
          suffix := suffix || substr(alphabet, pos, 1);
        END LOOP;
        candidate := 'mangve-' || suffix;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM dining_tables WHERE qr_token = candidate
        );
      END LOOP;

      UPDATE master_data
      SET metadata = jsonb_set(
        jsonb_set(takeaway_meta, '{qrToken}', to_jsonb(candidate), true),
        '{updatedAt}',
        to_jsonb(to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        true
      )
      WHERE category = 'SYSTEM_CONFIG'
        AND normalized_name = 'takeaway_qr_config';
    END IF;
  END IF;
END $$;
