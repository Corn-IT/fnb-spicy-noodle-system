-- Cập nhật phụ thu Size L từ 7.000đ xuống 5.000đ cho 10 danh mục Pha chế đã gắn nhóm Size
UPDATE modifiers m
SET extra_price = 5000.00
FROM modifier_groups mg
JOIN products p ON p.id = mg.product_id
JOIN master_data md ON md.id = p.category_id
WHERE m.group_id = mg.id
  AND LOWER(TRIM(mg.name)) = 'size'
  AND LOWER(TRIM(m.name)) = 'size l'
  AND m.extra_price = 7000.00
  AND md.category = 'MENU_CATEGORY'
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
  );
