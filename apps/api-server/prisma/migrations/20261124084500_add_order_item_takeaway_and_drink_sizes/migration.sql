-- 1. Thêm cột is_takeaway vào bảng order_items (đánh dấu món gọi mang về trên đơn tại bàn)
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "is_takeaway" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Thêm nhóm tuỳ chọn Size (Size M +0đ mặc định, Size L +7.000đ) cho tất cả món thuộc 10 danh mục Pha chế
DO $$
DECLARE
  prod RECORD;
  new_group_id INT;
BEGIN
  FOR prod IN
    SELECT p.id
    FROM products p
    JOIN master_data md ON md.id = p.category_id
    WHERE md.category = 'MENU_CATEGORY'
      AND md.normalized_name IN (
        'tra hoa qua tuoi',
        'tra trai cay',
        'tra sua',
        'coffee',
        'sinh to',
        'nuoc ep hoa qua',
        'da xay',
        'sua chua',
        'sua tuoi',
        'soda y'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM modifier_groups mg
        WHERE mg.product_id = p.id
          AND LOWER(TRIM(mg.name)) = 'size'
      )
  LOOP
    INSERT INTO modifier_groups (product_id, name, is_required, max_select, is_auto_select, allow_substitution)
    VALUES (prod.id, 'Size', TRUE, 1, FALSE, FALSE)
    RETURNING id INTO new_group_id;

    INSERT INTO modifiers (group_id, name, extra_price, is_default_checked, is_available, default_substitute_name)
    VALUES
      (new_group_id, 'Size M', 0.00, TRUE, TRUE, NULL),
      (new_group_id, 'Size L', 7000.00, FALSE, TRUE, NULL);
  END LOOP;
END $$;
