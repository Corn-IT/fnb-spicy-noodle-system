## Nhánh • Đánh giá thiết kế hệ thống POS FnB [URL 🔗](https://gemini.google.com/app/d3e1901615ce16ca)

[https://gemini.google.com/app/d3e1901615ce16ca](https://gemini.google.com/app/d3e1901615ce16ca)

User prompt: Hãy tìm hiểu và phân tích chuyên sâu về kế hoạch bên dưới của mình sau đó đánh giá về mức độ khả thi và các ưu điểm lẫn nhược điểm lẫn các GAP của dự án / tính năng. Tình hình là mình đang làm một cửa hàng FnB mô hình kinh doanh mì cay kèm đồ chiên và nước uống. Khu vực bếp nói chung sẽ chia ra thành 3 khu vực riêng: bếp nấu (mì cay), bếp chiên (đồ chiên) và quầy pha chế (nước uống). Hiện tại khi khách hàng đặt đồ (order) thì sẽ ghi vào một tờ giấy note, sau đó đưa vào quầy thu ngân chia ra lại thành 3 mẫu giấy note để phân chia cho 3 khu vực riêng trong khu vực bếp. Là một lập trình viên Full-stack thì mình đang muốn làm một hệ thống đặt đồ (order) bằng quét mã QR và các trang quản trị hệ thống. 1. Sau khi quét mã QR thì hệ thống sẽ chuyển đơn đặt (ordered) vào trang đặt đơn ở máy tính của quầy thu ngân, trong trang đặt đơn đó mình gọi tắt là hoá đơn điện tử và trong trang hoá đơn điện tử sẽ có thông tin của đơn đặt và có thêm 2 nút là "Tách đơn" và "Thanh toán": - "Tách đơn" khi bấm vào thì hệ thống sẽ tự động phân ra thành 3 khu vực riêng sau đó sẽ in ra, nội dung in ra sẽ tương ứng với đơn đặt chung ban đầu của khách hàng. Trên giấy in của "tách đơn" thì sẽ có thêm logo để phân biệt giống như bếp nấu sẽ có logo mũ đầu bếp / tô mì cay; bếp chiên sẽ có logo khoai tây chiên; quầy nước uống sẽ có logo ly nước. - "Thanh toán" khi bấm vào nút này sẽ có hiển thị thêm một pop-up thông báo để confirm lại có thanh toán thật sự hay không tránh việc bấm nhầm. Pop-up sẽ có 2 nút là "Xác nhận" và "Hủy bỏ“. + "Xác nhận" sẽ hiển thị thêm 2 lựa chọn bằng nút là "In hoá đơn" và "Không in". ++ "In hoá đơn" thì sẽ in ra hoá đơn đặt hàng ban đầu của khách hàng kèm với mã QR chuyển khoản (thông tin chuyển khoản). 2. Màn hình hoá đơn. - Sẽ lưu lại tất cả các hoá đơn dưới dạng base table, base table sẽ có các cột: STT; Mã hoá đơn; thời điểm tạo (ngày giờ phút giây); Giá tiền, Ghi chú, Thao tác (action button "Eye" xem chi tiết bấm vào sẽ hiển thị đầy đủ hoá đơn các món ăn từ đơn đặt của khách hàng). Thêm thanh tìm kiếm để tìm kiếm các giá trị "Mã hoá đơn" và "Thời điểm tạo" dưới dạng dropdown ở một phần thanh tìm kiếm nằm bên trái. Khi chọn thời điểm tạo sẽ hiển thị lịch còn chọn mã hoá đơn sẽ hiện input nhập keyword. 3. Màn hình khác sẽ có tính năng nhập hàng. - Base table sẽ hiển thị bao gồm " STT"; "Tên món hàng"; "Đơn giá"; " Số lượng"; "Ghi chú". + Thêm thanh tìm kiếm để tìm kiếm lại những giá trị cũ theo ngày / tháng / năm, tên món hàng dưới dạng dropdown. Khi chọn từ dropdown là ngày tháng năm sẽ xuất hiện lịch để chọn còn khi chọn tên món hàng sẽ hiển thị input nhập keyword. - Nút "Thêm mới" sẽ mở ra một drawer từ bên phải thêm tên món hàng vào base table. Khi thêm mới sản phẩm thì các "Tên món hàng" sẽ được lưu trữ lại để gọi tới cho lần sau (ngày khác) bằng hình thức search trên base table khi search xong sẽ tự thêm vào base table. Input nhập "Tên món hàng" sẽ được lưu trữ lại nếu "Tên món hàng" chưa có trong hệ thống và sẽ có một Master Data chứa các giá trị lưu trữ này. Trong drawer cũng sẽ có các cột như trong base table. - Trong base table cũng sẽ có thêm nút icon thùng rác dùng để xoá item ở cột cuối cùng theo từng dòng item. 4. Màn hình khác sẽ có tính năng "Ngân sách và dòng tiền". - Sẽ có base table hiển thị các cột: Ngân sách, dòng tiền, tình trạng (dư, thiếu, chuẩn), ngày. Thêm thanh tìm kiếm sẽ tìm kiếm theo ngày. - Trong này sẽ hiển thị ngân sách hàng ngày, đây là tiền mặc định sẽ để vào két mỗi ngày dùng cho thối tiền; chi tiền; mua sắm trong ngày của cửa hàng. Và nó sẽ có một mức mặc định mà Admin nhập vào. - "Dòng tiền" sẽ là tính năng tổng cộng lại tất cả các hoá đơn đã thu được trong ngày kèm với ngân sách. + Màn hình này sẽ có thêm một component riêng để nhập tiền đếm được trong két của ngày bao gồm tất cả. ++ Sau khi nhập xong thì sẽ có nút "Kết ca" lúc này hệ thống sẽ có phương pháp logic tính toán để phân chia lại cho ngân sách mặc định đầu tiên sau đó đối chiếu phần tiền còn lại so với tổng cộng tất cả các hoá đơn thu được trong ngày hôm đó. Phần tiền còn thừa ra hay thiếu đi cũng sẽ hiển thị. +++ Nếu sau "Kết ca" hiển thị là 0 thì sẽ là chuẩn, hiển thị là >0 thì sẽ là dư, hiển thị là <0 sẽ là thiếu. 5. Quản lý nhân viên. - Ở màn hình này thì sẽ hiển thị base table với các cột sau: STT, Tên nhân viên, Năm sinh, Chức vụ, Chuyên môn, Ghi chú, Thao tác. Kèm thanh tìm kiếm với giá trị là Tên nhân viên và chức vụ và chuyên môn, ở một phần bên trái của thanh search sẽ có sẵn 2 bộ lọc là "Tên nhân viên" hoặc "Chuyên môn" dưới dạng dropdown và các giá trị search phải nằm trong filter dropdown đó. + "Thao tác" sẽ có action button "Eye" xem chi tiết, "Pencil" chỉnh sửa, "Trash" xoá nhân viên (có pop-up confirm). - "Thêm mới" sẽ có các field "Tên nhân viên", ngày tháng năm sinh, Nơi ở, Số căn cước công dân (nơi cấp), chức vụ (lấy từ Master Data - nếu không có thì tự nhập và nhập xong sẽ tự lưu vào MDM), chuyên môn (lấy từ Master Data - nếu không có thì tự nhập và nhập xong sẽ tự lưu vào MDM), số điện thoại, Ngày vào làm, ghi chú, file đính kèm (upload file). 6. Lịch làm việc. Sẽ hiển thị dạng cột dòng giống như Excel phân ra đủ 7 ngày trong tuần với cột và các dòng sẽ hiển thị khung giờ (có thể sẽ chia ra theo khung giờ custom của cửa hàng). - Sẽ được phép chỉnh trực tiếp từ màn hình này và có nút "Lưu" để lưu lại tránh vô tình chỉnh nhầm. Nếu dữ liệu có điều chỉnh nhưng chưa bấm nút "Lưu" mà chuyển sang tab khác hoặc tắt trang thì sẽ hiển thị pop-up thông báo tình trạng. - Các dữ liệu trong table sẽ hiển thị dưới dạng dropdown và dữ liệu chỉ hiển thị tên lót và tên với tên lót viết tắt từ trang Quản lý nhân viên. Ví dụ tên nhân viên là Nguyễn Văn Anh thì sẽ hiển thị data trong dropdown là "V.Anh", drowdown cũng cho phép search keyword. 7. Master Data dạng dropdown. Sẽ phân ra các category tương ứng với các trang cần Master Data. Trong view sẽ hiển thị base table với các giá trị tương ứng. 8. Phân quyền hệ thống Sẽ phân quyền các tài khoản hiển thị dưới dạng base table và có bánh răng settings để bấm vào mở drawer hiển thị các trang có trong hệ thống dưới dạng checkbox, khi tích chọn sẽ cho phép tài khoản có thể nhìn thấy được hoặc vào được link của các màn hình trong hệ thống. Nếu tài khoản nào cố tình vào bằng link "/" thì sẽ check phân quyền và hiển thị 401 không đủ quyền hạn. Trong các checkbox sẽ có dropdown CRUD của các màn hình nữa nha chứ không phải cứ tích chọn checkbox thì sẽ có full quyền thực thi trong trang đó đâu, nếu chỉ tích chọn bình thường thì chỉ có thể view thôi. - Riêng đối với tài khoản Admin thì sẽ full quyền hạn và sẽ là readonly. - Trong màn hình này sẽ có nút "Thêm mới" để thêm mới một tài khoản khác (chỉ có Admin có quyền hạn này). 9. Thanh Navbar, góc phải sẽ hiển thị tên tài khoản và hình đại diện (avatar). Bấm vào tài khoản hoặc hình đại diện (nối liền bằng link) thì sẽ có dropdown hồ sơ tài khoản và đăng xuất. - Trang hồ sơ tài khoản sẽ có thông tin như: họ và tên, ngày tháng năm sinh, số điện thoại, chuyên môn (mặc định được mapping từ quản lý thành viên) readonly, nơi ở, số căn cước công dân, nơi cấp, thông tin ngân hàng. Ảnh đại diện (upload file, edit avatar resize). - Đăng xuất thì khi đăng xuất sẽ xoá luôn bộ nhớ đệm của tài khoản đó. Bên cạnh trái avatar tên tài khoản sẽ cách ra một khoảng và hiển thị icon theme sáng tối. Kế bên icon theme sáng tối sẽ có thanh search nhỏ đại diện thôi, khi bấm vào thanh search sẽ hiển thị pop-up cho phép search các category từ sidebar (các màn hình sẽ là các category ở sidebar). *Lưu ý: các cột sẽ có thể resize và cả sidebar cũng có thể resize.

Response: Bản thiết kế hệ thống POS và quản trị vận hành (ERP thu nhỏ) của bạn giải quyết rất trúng bài toán thực tế tại quán mì cay: xóa bỏ điểm nghẽn ghi giấy tay và chép lại thành 3 phiếu ở quầy thu ngân. Với năng lực của một lập trình viên Full-stack, dự án này hoàn toàn khả thi về mặt kỹ thuật, nhưng đang tồn tại một số lỗ hổng nghiệp vụ (Business Logic GAPs) quan trọng ở luồng thanh toán QR, công thức kết ca dòng tiền, xử lý gọi thêm món và cơ chế in ấn từ trình duyệt.

## 1. Đánh giá ملاức độ khả thi, Ưu điểm và Nhược điểm

## Mức độ khả thi

- Về mặt phần mềm (95% khả thi): Các tính năng CRUD, phân quyền RBAC, bảng biểu tương tác (Excel-like grid), tìm kiếm đa điều kiện và quản lý trạng thái đều nằm trong tầm tay của các stack hiện đại (như React/Next.js kết hợp NestJS/Node.js và PostgreSQL).

- Về mặt phần cứng và vận hành (70% khả thi nếu giữ nguyên thiết kế): Rào cản kỹ thuật lớn nhất nằm ở thao tác "Tách đơn và In ra". Trình duyệt web thông thường không cho phép in ngầm (silent print) ra 3 phiếu rời nhau hoặc bắn tới 3 máy in khác nhau mà sẽ bật hộp thoại window.print() bắt thu ngân bấm xác nhận thủ công liên tục.

## Ưu điểm nổi bật

- Tư duy UX/UI hiện đại, sát thực tế: Có cơ chế cảnh báo dữ liệu chưa lưu (Unsaved changes guard) ở trang Lịch làm việc, thanh tìm kiếm toàn cục (Command Palette) trên Navbar, hỗ trợ Dark/Light mode và cho phép kéo giãn (resize) cột/sidebar.

- Hệ thống phân quyền chặt chẽ: Không chỉ chặn ở mức truy cập trang (View) mà đi sâu tới từng quyền thao tác (CRUD) cho từng màn hình.


- Tối ưu tốc độ nhập liệu: Tính năng tự động lưu từ khóa mới vào Master Data (MDM) và rút gọn tên nhân viên (Nguyễn Văn Anh thành V.Anh) giúp giảm thao tác thừa trong giờ cao điểm.

## Nhược điểm hiện tại

- Vẫn phụ thuộc vào thao tác phân phối giấy tại thu ngân: Nếu bấm "Tách đơn" mà cả 3 phiếu cùng in ra tại 1 máy in ở quầy thu ngân, nhân viên vẫn phải xé giấy và chạy đi phát cho 3 khu vực (Bếp nấu, Bếp chiên, Quầy nước), dễ thất lạc phiếu khi quán đông hoặc quạt công nghiệp thổi bay.

- Rủi ro sinh rác dữ liệu (Data Pollution): Việc cho phép tự nhập và tự động lưu vào Master Data ở nhiều màn hình dễ dẫn đến trùng lặp dữ liệu do lỗi chính tả.

- Gộp chung dòng tiền: Chưa tách bạch giữa doanh thu Tiền mặt và Chuyển khoản trong thuật toán Kết ca.

## 2. Phân tích các GAP (Lỗ hổng) cốt lõi theo từng Module

## GAP 0: Thiếu 2 màn hình nền tảng (Quản lý Thực đơn và Quản lý Bàn/QR)

Trong 9 mục bạn liệt kê đang thiếu mất nguồn dữ liệu đầu vào cho tính năng số 1:

- Thiếu trang Quản lý Món ăn (Menu Management): Hệ thống cần một nơi để khai báo tên món, giá bán, trạng thái (Còn hàng/Hết món), tuỳ chọn đi kèm (Cấp độ cay từ 0 đến 7, thêm topping) và quan trọng nhất là gán nhãn khu vực chế biến (Bếp nấu, Bếp chiên, hay Quầy pha chế). Không có trường phân loại này ở cấp độ món ăn, nút "Tách đơn" sẽ không biết dựa vào đâu để chia đơn thành 3 phiếu.

- Thiếu trang Quản lý Bàn và Mã QR: Cần định danh từng bàn (Bàn 01, Bàn 02, Mang về) để biết khách đang ngồi bàn nào khi quét mã.

## Module 1: Quét QR đặt món, Tách đơn và Thanh toán

1. Nghịch lý quy trình "Thanh toán" rồi mới "In hoá đơn kèm QR chuyển khoản" Theo thiết kế của bạn, thu ngân bấm Thanh toán → Xác nhận → In hoá đơn (có QR chuyển khoản). Về mặt nghiệp vụ, khi đã bấm "Xác nhận thanh toán", hệ thống đã chốt đơn đó thu tiền thành công, trong khi lúc này tờ bill có mã QR mới được in ra để mang cho khách quét chuyển tiền.

- Giải pháp: Tách thành 2 nút riêng biệt: "In tạm tính (kèm VietQR động)" để đưa khách kiểm tra món và quét mã chuyển khoản trước; sau khi nhận được tiền (hoặc tiền mặt) mới bấm "Thanh toán (Đóng đơn)" và chọn phương thức là Tiền mặt hay Chuyển khoản.

2. Bài toán "Gọi thêm món" (Add-on Order) và "Đổi/Huỷ món" Khách ăn mì cay rất hay gọi thêm bò viên, xúc xích hoặc thêm nước uống giữa chừng.

- Lỗ hổng: Nếu khách quét QR lần 2 để gọi thêm 1 ly trà sữa, hệ thống sẽ tạo ra một hoá đơn mới tinh hay cộng dồn vào hoá đơn đang mở của bàn đó? Nếu cộng dồn vào đơn cũ, khi thu ngân bấm "Tách đơn" lần 2, máy in sẽ in lại toàn bộ các món từ đầu (gây nấu trùng món) hay chỉ in phần món mới gọi thêm?

- Giải pháp: Quản lý trạng thái theo Phiên bàn (Table Session) và đánh dấu trạng thái từng món (Mới gọi, Đã tách bếp, Đã huỷ). Nút "Tách đơn" chỉ lọc các món có trạng thái Mới gọi để in phiếu bổ sung (Order Bổ Sung) và chuyển trạng thái sang Đã tách bếp.

3. Lỗ hổng bảo mật khi quét QR (Đặt đơn ảo / Spam) Nếu mã QR tĩnh dán cố định ở bàn, kẻ xấu có thể chụp ảnh mã QR về nhà quét và đặt hàng chục đơn ảo làm loạn màn hình thu ngân.

- Giải pháp: Đơn từ QR gửi vào thu ngân phải nằm ở trạng thái "Chờ duyệt". Nhân viên xác nhận khách có ngồi tại bàn mới bấm "Duyệt & Tách bếp", hoặc sử dụng mã QR động có token theo phiên bàn.

## Module 2: Màn hình Hoá đơn

- Thiếu cột thông tin cốt lõi: Cần bổ sung cột Bàn, Trạng thái đơn (Đang phục vụ, Đã thanh toán, Đã huỷ) và Phương thức thanh toán (Tiền mặt, Chuyển khoản, Hỗn hợp).

- Hạn chế của thanh tìm kiếm 1 điều kiện: Việc dùng dropdown bắt chọn 1 trong 2 (Mã hoá đơn hoặc Thời điểm tạo) khiến bạn không thể lọc danh sách hoá đơn theo Khoảng thời gian (Từ ngày - Đến ngày) kết hợp với trạng thái đơn. Nên tách riêng Date Range Picker ra khỏi ô nhập từ khoá.

## Module 3: Nhập hàng và Auto-Master Data

- Thiếu cột "Đơn vị tính" và "Thành tiền": Nhập nguyên liệu bắt buộc phải có Đơn vị tính (Thùng, Kg, Gói, Két) và cột Thành tiền (Số lượng * Đơn giá). Ngoài ra, cần làm rõ "Đơn giá" ở đây là giá của 1 đơn vị nhỏ hay tổng giá của cả lô hàng.

- Bẫy trùng lặp Master Data: Nếu cho phép gõ tự do để tự tạo Master Data, hôm nay nhân viên gõ "Mì Hàn Quốc", ngày mai người khác gõ "Mì HQ" hoặc "Mỳ Hàn Quốc". Hệ thống sẽ tạo ra 3 mã hàng khác nhau, làm sai lệch hoàn toàn lịch sử tìm kiếm theo tên món hàng.

- Rủi ro nút Xoá (Trash icon): Không nên cho phép nhân viên xoá thẳng phiếu nhập hàng của những ngày trước mà không có log lịch sử, vì nhân viên có thể lợi dụng để sửa/xoá phiếu nhập nhằm gian lận tiền mua nguyên vật liệu.

## Module 4: Ngân sách và Dòng tiền (Lỗ hổng nghiệp vụ nghiêm trọng nhất)

Công thức bạn đang thiết kế sẽ dẫn đến sai lệch số liệu chắc chắn 100% khi vận hành thực tế vì 2 lý do:

- 1. Lẫn lộn Tiền mặt và Chuyển khoản: Khi khách thanh toán bằng mã QR chuyển khoản, tiền chảy thẳng vào tài khoản ngân hàng, không hề nằm trong két tiền mặt. Nếu "Dòng tiền" cộng tổng tất cả các hoá đơn (bao gồm cả đơn chuyển khoản) rồi đem đối chiếu với "Tiền đếm được trong két", cuối ngày hệ thống sẽ luôn báo Thiếu tiền đúng bằng số tiền khách đã chuyển khoản.

- 2. Chưa trừ khoản Chi tiền mặt trong ngày (Cash Out): Bạn có nêu ngân sách đầu ngày dùng để "thối tiền; chi tiền; mua sắm trong ngày". Giả sử đầu ngày bỏ vào két 1.000.000đ, trong ngày lấy 300.000đ trong két để trả tiền nhập đá bi và rau sống (ở Module 3). Nếu khi

ế

ế

ố

ầ


"Kết ca" hệ thống vẫn mặc định giữ lại 1.000.000đ ngân sách đầu ngày mà không trừ đi 300.000đ đã chi mua hàng, két sẽ bị báo Thiếu 300.000đ.

## Công thức chuẩn bạn cần áp dụng cho nút "Kết ca":

- Tiền mặt lý thuyết trong két = Ngân sách mặc định đầu ca + Tổng hoá đơn thu TIỀN MẶT - Tổng tiền mặt đã CHI mua hàng trong ca.

- Chênh lệch kết ca = Tiền mặt thực đếm trong két - Tiền mặt lý thuyết trong két.

- Nếu Chênh lệch bằng 0 → Chuẩn; nếu Chênh lệch lớn hơn 0 → Dư; nếu Chênh lệch nhỏ hơn 0 → Thiếu.

- Doanh thu Chuyển khoản phải được tách thành một cột riêng để đối soát với biến động số dư ngân hàng.

- Gợi ý thêm: Nên quản lý kết ca theo Ca làm việc (Ca sáng / Ca tối) thay vì chỉ theo Ngày, để quy rõ trách nhiệm khi két bị hụt tiền.

## Module 5 & 6: Quản lý nhân viên và Lịch làm việc

- Xung đột tên viết tắt trong Lịch làm việc: Thuật toán rút gọn Nguyễn Văn Anh thành V.Anh rất gọn cho giao diện dạng bảng Excel. Tuy nhiên, nếu quán có 2 nhân viên tên là Nguyễn Văn Anh và Trần Văn Anh (hoặc Lê Việt Anh), cả hai sẽ cùng hiển thị là V.Anh trong dropdown. Cần xử lý hậu tố tự động khi trùng (ví dụ: N.V.Anh và T.V.Anh, hoặc V.Anh (01)).

- Một khung giờ có nhiều nhân viên cùng làm: Tại một ô giao giữa Thứ Bảy và khung giờ cao điểm (18:00 - 22:00), quán cần tới 4-5 nhân viên (Bếp nấu, Bếp chiên, Pha chế, Phục vụ). Nếu mỗi ô trong bảng chỉ là một dropdown chọn 1 người thì không thể xếp lịch đủ cho cả quán. Bạn cần thiết kế ô này dưới dạng Multi-select Tags (chọn nhiều người trong 1 ô) hoặc chia dòng theo cấu trúc Khung giờ + Chuyên môn.

- Trùng lặp dữ liệu giữa Nhân viên (Module 5) và Hồ sơ tài khoản (Module 9): Cả 2 nơi đều lưu Họ tên, Ngày sinh, SĐT, Nơi ở, CCCD. Bạn nên thiết kế bảng Account (User) liên kết khoá ngoại 1-1 với bảng Employee để lấy chung một nguồn dữ liệu duy nhất, nhân viên cập nhật ở Hồ sơ cá nhân thì trang Quản lý nhân viên cũng tự đồng bộ.

## Module 7, 8 & 9: Master Data, Phân quyền và Giao diện chung

- Sai mã lỗi chuẩn HTTP ở Module 8: Khi người dùng đã đăng nhập nhưng cố tình truy cập đường dẫn không nằm trong danh sách phân quyền, hệ thống phải trả về mã lỗi 403 Forbidden (Không đủ quyền hạn), không phải 401 Unauthorized (401 chỉ dùng khi chưa đăng nhập hoặc hết hạn phiên đăng nhập).

- Bảo mật API ở Backend: Không chỉ ẩn link ở Sidebar hay chặn Route ở Frontend, bạn bắt buộc phải gắn Middleware kiểm tra quyền CRUD ở từng API dưới Backend.

- Cơ chế Xoá mềm (Soft Delete): Với Nhân viên và Master Data, nút thùng rác (Trash) chỉ nên cập nhật trạng thái is_deleted = true thay vì xoá vĩnh viễn khỏi Database (DELETE FROM), nhằm bảo toàn dữ liệu cho các hoá đơn và lịch sử nhập hàng cũ trong quá khứ.

## 3. Bảng tổng hợp Giải pháp Kỹ thuật đề xuất

| Hạng mục | Vấn đề thực tế | Giải pháp kỹ thuật khuyên dùng |
| --- | --- | --- |
| In tách 3 bếp | window.print() bật pop-up làm chậm thu | Dùng máy in nhiệt LAN (cổng 9100) kết hợp Local Print Service bắn lệnh |
|   | ngân | cắt giấy tự động |
| Đồng bộ đơn | Thu ngân phải F5 mới thấy đơn khách vừa | Sử dụng WebSockets (Socket.io) hoặc Server-Sent Events (SSE) kèm âm |
| QR | đặt | báo chuông |
| Mã QR Thanh | Khách nhập sai số tiền hoặc nội dung | Tích hợp chuẩn VietQR API tạo mã QR động chứa sẵn số tiền và mã hoá |
| toán | chuyển khoản | đơn |
| Lưu trạng thái | Mất kích thước cột/sidebar và theme khi tải | Lưu cấu hình độ rộng cột, sidebar và Dark/Light mode vào localStorage |
| UI | lại trang |   |
| Quản lý ảnh & | Đính kèm hồ sơ nhân viên và crop ảnh đại | Dùng thư viện react-easy-crop ở Client, nén ảnh sang WebP trước khi |
| file | diện | đẩy lên Cloud Storage |

Nếu bạn muốn tối ưu hơn nữa ở khâu bếp mà không tốn tiền mua 3 máy in nhiệt hay tốn giấy in, bạn có thể tận dụng chính lợi thế Full-stack của mình để làm thêm một Màn hình hiển thị bếp (KDS - Kitchen Display System) chạy trên máy tính bảng hoặc điện thoại cũ treo ở 3 khu vực bếp: thu ngân vừa bấm "Tách đơn" là món ăn nhảy thẳng lên màn hình của đúng bếp đó theo thời gian thực.

User prompt: Hãy Phân tích các GAP (Lỗ hổng) cốt lõi theo từng Module cực kì chi tiết hơn nữa, đi sâu thẳng vào vấn đề của các lỗ hổng đó so với thực tế và dưới cách dùng của người dùng thì. Đưa ra UX thực tế khả thi khi người dùng sử dụng. Sau đó đề xuất giải pháp xử lý các GAP đó kèm theo đánh giá mức độ tương thích phù hợp với hệ thống nói chung và UX nói riêng.

Response: Khi đưa một hệ thống phần mềm vào môi trường vận hành thực tế của quán mì cay (nơi có nhiệt độ cao, tiếng ồn lớn, khách ra vào dồn dập giờ cao điểm từ 18h00 đến 21h30, và nhân viên thao tác dưới áp lực thời gian tính bằng giây), mọi điểm nghẽn về mặt UX hoặc sơ hở trong logic nghiệp vụ đều sẽ lập tức gây ùn tắc quầy thu ngân hoặc sai lệch tiền nong.

## Module 0: Lỗ hổng "Hạt nhân Dữ liệu" bị khuyết (Thực đơn, Tuỳ chọn món & Định danh Bàn)

ế

ố

## 1. Vấn đề thực tế & Hành vi người dùng

ồ

ố

ắ ầ

ể


Trong bản kế hoạch hiện tại của bạn, luồng hệ thống bắt đầu từ câu: "Sau khi quét mã QR thì hệ thống sẽ chuyển đơn đặt vào trang đặt đơn ở máy tính của quầy thu ngân". Tuy nhiên, hệ thống chưa có nơi quản lý cấu trúc món ăn đặc thù của mô hình Mì cay - Đồ chiên - Nước uống:

- Hành vi gọi món của khách ăn mì cay: Khách không bao giờ chỉ chọn "Mì kim chi bò". Họ sẽ chọn: "1 Mì kim chi bò (Cấp độ 2, không hành) + Thêm 1 phần bò viên (15.000đ) + Thêm phô mai (10.000đ)". Nếu bạn không thiết kế cấu trúc Tuỳ chọn đi kèm (Modifiers/Toppings) mà chỉ cho khách gõ vào ô Ghi chú tự do, khách sẽ gõ "Cấp 2, thêm bò viên, thêm phô mai" vào ô Ghi chú. Hậu quả là hệ thống chỉ tính tiền tô mì gốc, làm thất thoát tiền các món gọi thêm (Topping), hoặc thu ngân phải ngồi đọc từng dòng ghi chú để cộng tay thêm tiền vào bill.

- Bài toán "Combo liên bếp": Quán thường có các gói như "Combo Đôi: 2 Mì cay + 1 Khoai tây chiên + 2 Trà đào". Khi khách chọn 1 item Combo này trên điện thoại, lúc thu ngân bấm nút "Tách đơn", hệ thống sẽ không biết phải đẩy Combo này về Bếp nấu, Bếp chiên hay Quầy nước vì bản thân nó chứa món của cả 3 khu vực.

## 2. UX thực tế khả thi & Giải pháp xử lý

- Xây dựng Module Quản lý Thực đơn (Menu & Modifiers):

- Mỗi món ăn (Product) bắt buộc gắn với thuộc tính Khu vực chế biến (Station): BEP_NAU, BEP_CHIEN, hoặc PHA_CHE.

- Thiết kế Nhóm tuỳ chọn (Modifier Groups) gắn vào món: Nhóm bắt buộc chọn 1 (Radio button: Cấp độ cay từ 0 đến 7) và Nhóm chọn nhiều có cộng tiền (Checkbox: Thêm kim chi +10k, Thêm xúc xích +15k).

- Với các món Combo, cấu hình dưới dạng Danh sách món thành phần (Bundle Items). Trên hoá đơn của khách vẫn hiện 1 dòng "Combo Đôi", nhưng khi bấm "Tách đơn", hệ thống tự động phân rã (explode) các món thành phần bên trong Combo để gửi Mì về Bếp nấu, Khoai tây về Bếp chiên và Trà đào về Quầy pha chế.

- Quản lý Bàn & Mã QR định danh: Tạo danh sách bàn (Bàn 01 đến Bàn 30, kèm Mang về). Mỗi bàn sinh ra 1 mã QR chứa URL có tham số định danh bàn và chữ ký bảo mật (ví dụ: [https://tenquan.vn/order?table=05&token=xyz](https://tenquan.vn/order? table=05&token=xyz)).

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Cung cấp khóa ngoại chuẩn xác để thuật toán "Tách đơn" ở Module 1 chạy tự động 100% mà không cần thu ngân phân loại tay.

- UX (10/10): Khách hàng thao tác chạm chọn cấp độ cay và topping trong 3 giây trên điện thoại thay vì phải gõ bàn phím; thu ngân không bao giờ tính thiếu tiền topping.

## Module 1: Quét QR đặt món, Hoá đơn điện tử, Tách đơn & Thanh toán

## 1. Vấn đề thực tế & Hành vi người dùng

GAP 1.1: Nghịch lý luồng "Bấm Thanh toán → Xác nhận → Mới in hoá đơn có mã QR chuyển khoản"

- Thực tế tại quầy: Khách ăn xong gọi "Em ơi tính tiền bàn 5". Lúc này khách chưa hề trả tiền và muốn xem tờ hoá đơn xem quán tính có đúng món không, tổng bao nhiêu tiền để họ mở app ngân hàng ra quét QR trên tờ giấy đó.

- Lỗ hổng theo thiết kế cũ: Để in được tờ hoá đơn có mã QR chuyển khoản đưa cho khách, thu ngân bắt buộc phải bấm Thanh toán → Xác nhận → In hoá đơn. Nhưng ngay khoảnh khắc bấm Xác nhận, hệ thống đã ghi nhận đơn hàng này Đã thu tiền thành công và cộng thẳng số tiền đó vào Dòng tiền trong ngày (Module 4).

- Tình huống phát sinh: Khi cầm tờ bill ra bàn, khách kiểm tra và nói: "Em ơi nãy bàn anh gọi 2 ly trà đào nhưng hết đào nên bếp chưa làm, em trừ 2 ly đó ra giúp anh" hoặc "Máy anh hết tiền chuyển khoản rồi, anh trả tiền mặt nhé". Lúc này đơn trên máy đã bị đóng (Closed), thu ngân không thể sửa lại món, và số liệu dòng tiền đã bị lệch!

## GAP 1.2: Hành vi "Gọi thêm món giữa chừng" (Add-on Order) làm nát luồng Tách đơn

- Thực tế tại quán: Khách đang ăn mì cay thấy ngon sẽ quét QR trên bàn lần thứ 2 để gọi thêm "1 đĩa Phô mai que" và "1 ly Pepsi", hoặc gọi với ra nhờ nhân viên bấm thêm vào máy.

## Lỗ hổng:

- Nếu mỗi lần khách quét QR hệ thống lại đẻ ra một Hoá đơn điện tử mới: Một bàn ngồi ăn 45 phút gọi thêm 3 lần sẽ tạo ra 4 hoá đơn rời rạc. Lúc thanh toán, thu ngân phải lục tìm cả 4 hoá đơn của bàn đó, in ra 4 tờ giấy và lấy máy tính bỏ túi cộng tay lại — cực kỳ rối loạn.

- Nếu gộp món mới vào chung Hoá đơn đang mở của bàn đó: Khi thu ngân bấm nút "Tách đơn" lần thứ 2 để làm món Phô mai que và Pepsi mới gọi, hệ thống sẽ in lại từ đầu cả 2 tô mì cay đã nấu từ 20 phút trước! Bếp nấu không biết đây là món cũ hay mới nên nấu thêm 2 tô mì nữa, gây hỏng đồ ăn và cãi vã giữa thu ngân với bếp.

## GAP 1.3: Chướng ngại kỹ thuật khi in 3 phiếu bếp từ trình duyệt Web

- Thực tế thao tác: Bạn muốn bấm "Tách đơn" là hệ thống tự chia ra 3 khu vực (kèm logo Mũ đầu bếp, Khoai tây chiên, Ly nước) và in ra.

- Lỗ hổng: Nếu gọi hàm window.print() của trình duyệt 3 lần cho 3 phiếu, trình duyệt sẽ bật cửa sổ Print Preview lên 3 lần bắt thu ngân bấm nút Print bằng chuột 3 lần liên tiếp. Còn nếu gộp 3 phiếu vào 1 trang in dài và dùng CSS page-break-after: always, phần lớn máy in nhiệt 80mm phổ thông nếu không cấu hình chuẩn sẽ hiểu đó là 1 bill dài và không cắt giấy ở giữa, bắt thu ngân phải tự xé tay.

## 2. UX thực tế khả thi & Giải pháp xử lý

- Giải pháp cho GAP 1.1 (Tách bạch "In tạm tính" và "Chốt thanh toán"):

ồ

ế ế


- Trên giao diện Hoá đơn điện tử của bàn đang ngồi, thiết kế 3 nút hành động rõ ràng theo đúng trình tự thời gian:

- 1. [Tách đơn bếp]: Đẩy món xuống 3 khu vực chế biến.

- 2. [In tạm tính (Kèm QR)]: Bấm nút này sẽ in ngay ra tờ phiếu kiểm món kèm Mã VietQR động (tự động nhúng đúng số tiền và nội dung chuyển khoản là Mã hoá đơn) để nhân viên mang ra bàn cho khách kiểm tra và quét chuyển khoản. Lúc này đơn vẫn ở trạng thái Đang phục vụ (Open), vẫn sửa/bớt món được nếu khách phản hồi.

- 3. [Thanh toán (Đóng đơn)]: Chỉ bấm khi khách đã đưa tiền mặt hoặc thu ngân đã nghe loa báo nhận chuyển khoản thành công. Khi bấm vào sẽ hiện Pop-up xác nhận gồm: Chọn phương thức (Tiền mặt / Chuyển khoản / Hỗn hợp), sau đó chọn Xác nhận & Không in (vì khách đã cầm tờ tạm tính rồi, tiết kiệm giấy in!) hoặc Xác nhận & In hoá đơn chính thức.

- Giải pháp cho GAP 1.2 (Cơ chế Delta Printing - Chỉ tách món mới gọi):

- Quản lý trạng thái ở cấp độ Từng dòng món ăn (Order_Item_Status): MOI_GOI (Mới gọi - chưa in bếp) và DA_TACH_BEP (Đã in xuống bếp).

- Khi khách ở Bàn 05 quét QR gọi thêm lần 2, hệ thống kiểm tra thấy Bàn 05 đang có hoá đơn mở (Open), liền tự động nối (append) các món mới vào hoá đơn đó với trạng thái MOI_GOI (hiển thị nhãn màu cam nổi bật trên màn hình thu ngân).

- Nút "Tách đơn" lúc này chỉ lọc ra các món có trạng thái MOI_GOI để chia về 3 khu vực bếp và in phiếu (trên đầu phiếu in tự động dòng chữ [GỌI THÊM - LƯỢT 2] kèm logo từng bếp), đồng thời chuyển trạng thái các món đó sang DA_TACH_BEP.

- Nếu tờ giấy dưới bếp bị ướt hoặc rớt mất, thu ngân có thể bấm vào icon In lại (Re-print) nhỏ nằm ở cạnh từng món hoặc từng nhóm bếp.

- Giải pháp cho GAP 1.3 (In ngầm không chạm - Zero-Click Silent Printing):

- Khởi chạy trình duyệt ở máy thu ngân với cờ --kiosk-printing (tắt hoàn toàn hộp thoại xác nhận in của trình duyệt) hoặc dùng một dịch vụ trung gian nhẹ chạy ở localhost (như QZ Tray hoặc Node.js ESC/POS service) để bắn lệnh cắt giấy vật lý (GS V) tách rời 3 phiếu ngay lập tức khi thu ngân bấm "Tách đơn".

## 3. Đánh giá mức độ tương thích

- Hệ thống (9.5/10): Chỉ cần thêm trường status và batch_number (lượt gọi) vào bảng chi tiết hoá đơn (order_items), giữ nguyên kiến trúc tổng thể.

- UX (10/10): Tiết kiệm 50% lượng giấy in bill, loại bỏ 100% rủi ro bếp nấu trùng món và khớp hoàn toàn với thói quen kiểm bill trước khi trả tiền của khách Việt Nam.

## Module 2: Màn hình Quản lý Hoá đơn (Lịch sử & Tra cứu)

## 1. Vấn đề thực tế & Hành vi người dùng

- Hành vi tra cứu thực tế: Bạn thiết kế thanh tìm kiếm có một dropdown bên trái bắt người dùng chọn 1 trong 2 chế độ: tìm theo Mã hoá đơn (hiện ô nhập chữ) HOẶC tìm theo Thời điểm tạo (hiện lịch).

- Lỗ hổng UX nghiêm trọng:

- Trong thực tế, không một khách hàng hay nhân viên nào nhớ nổi Mã hoá đơn (ví dụ HD-20261104-0089). Khi cần kiểm tra lại một đơn hàng bị thắc mắc, câu hỏi thực tế luôn là: "Tìm lại cho chị cái đơn bàn số 4 lúc tầm 7h tối nay có ghi chú là không lấy kim chi".

- Với thiết kế chọn 1 trong 2 của bạn: Nếu thu ngân chọn Thời điểm tạo trên dropdown, nếu lịch bắt chọn đến tận ngày giờ phút giây thì không bao giờ tìm trúng (vì không ai nhớ đơn tạo ở giây thứ mấy!). Còn nếu lịch chỉ chọn theo Ngày, màn hình sẽ đổ ra 150 hoá đơn của cả ngày hôm đó, và vì đang ở chế độ Thời điểm tạo nên ô nhập keyword đã biến mất — thu ngân không thể gõ tiếp chữ để lọc trong 150 đơn đó!

- Thiếu thông tin tài chính và trạng thái trên Base Table: Bảng hiện chỉ có STT, Mã HĐ, Thời điểm tạo, Giá tiền, Ghi chú, Thao tác. Khi nhìn vào bảng này, chủ quán không biết đơn nào thu bằng Tiền mặt, đơn nào thu bằng Chuyển khoản, và đơn nào là đơn Đã huỷ (do khách đặt nhầm).

## 2. UX thực tế khả thi & Giải pháp xử lý

- Tách Bộ lọc Thời gian (Date Range) ra khỏi Ô tìm kiếm từ khoá:

- Bên trái thanh công cụ là Bộ chọn Ngày/Khoảng ngày (mặc định luôn chọn sẵn là Hôm nay để bảng tải cực nhanh).

- Bên phải là Thanh Search có Dropdown tiêu chí (Mã hoá đơn / Số bàn / Ghi chú). Hai bộ lọc này kết hợp với nhau (điều kiện AND): Thu ngân chọn ngày hôm qua trên lịch, đồng thời gõ số bàn hoặc mã đơn vào ô tìm kiếm.

- Nâng cấp các cột trong Base Table: Thêm cột Bàn, Phương thức TT (Badge màu xanh lá cho Tiền mặt, xanh dương cho Chuyển khoản) và Trạng thái (Hoàn thành / Đã huỷ).

- Thêm chức năng "Huỷ hoá đơn (Void)" có kiểm soát trong nút "Eye": Khi bấm vào icon con mắt (Eye) để xem chi tiết món, bổ sung nút "In lại hoá đơn" (phòng khi khách xin lại bill về thanh toán công ty) và nút "Huỷ hoá đơn" (chỉ dành cho Admin/Quản lý, bắt buộc nhập lý do huỷ để trừ ngược khỏi doanh thu ngày).

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Truy vấn SQL sử dụng WHERE created_at BETWEEN ... AND ... giúp đánh Index ngày tháng hiệu quả, tránh việc load toàn bộ hàng vạn hoá đơn từ lúc mở quán vào Base Table.

ấ

ầ


- UX (9.5/10): Thu ngân tìm ra bất kỳ hoá đơn nào trong vòng chưa đầy 5 giây.

## Module 3: Màn hình Nhập hàng (Quản lý Nguyên vật liệu đầu vào)

## 1. Vấn đề thực tế & Hành vi người dùng

## GAP 3.1: Xung đột hành vi giữa "Tìm kiếm lịch sử" và "Tự động chèn dòng mới" trên cùng 1 Base Table

- Phân tích mô tả của bạn: Bạn viết rằng trên Base Table có thanh tìm kiếm để tìm lại giá trị cũ theo ngày/tháng/năm hoặc tên món hàng. Nhưng ngay bên dưới bạn lại viết: "Khi thêm mới sản phẩm thì các Tên món hàng sẽ được lưu trữ lại để gọi tới cho lần sau (ngày khác) bằng hình thức search trên base table khi search xong sẽ tự thêm vào base table".

- Thảm hoạ UX khi sử dụng:

- Giả sử Chủ quán vào màn hình Nhập hàng, muốn kiểm tra xem trong tháng này quán đã mua bao nhiêu ký "Bò Mỹ". Chủ quán chọn dropdown trên thanh search của Base Table là Tên món hàng, rồi gõ chữ "Bò Mỹ" và bấm Enter.

- Thay vì lọc bảng để xem lịch sử, hệ thống lại kích hoạt tính năng "search xong tự thêm vào base table" — tức là tự động tạo thêm một dòng nhập hàng "Bò Mỹ" mới tinh vào ngày hôm nay! Người dùng sẽ hoàn toàn bối rối vì không biết thanh search đó dùng để Xem dữ liệu cũ hay để Tạo dữ liệu mới.

## GAP 3.2: Bẫy "Đơn giá" vs "Thành tiền" và thiếu "Đơn vị tính"

- Trong thực tế quán mì cay, sáng hôm nay nhân viên mua 5 Kg Bạch tuộc với đơn giá 120.000đ/Kg (tổng trả 600.000đ). Ngày mai mua 2 Thùng Mì cay với đơn giá 350.000đ/Thùng (tổng trả 700.000đ).

- Base Table của bạn chỉ có "Tên món hàng", "Đơn giá", "Số lượng", "Ghi chú" mà thiếu mất cột Đơn vị tính và Thành tiền (Tổng tiền). Nếu không có cột Thành tiền = Đơn giá * Số lượng, mỗi dòng nhân viên nhập Đơn giá: 120.000, Số lượng: 5, khi nhìn vào bảng người ta không biết tổng số tiền thực chi là 120.000đ hay 600.000đ!

## GAP 3.3: Mất liên kết với Két tiền mặt ở Module 4

- Không phải mọi món hàng nhập vào quán đều lấy tiền từ két sắt thu ngân để trả. Những món nhỏ lẻ hàng ngày (đá bi, rau muống, nấm kim châm, gas) thu ngân lấy tiền mặt trong két trả ngay cho người giao. Nhưng những đơn hàng lớn (thịt bò đông lạnh, 50 thùng nước ngọt, bao bì) chủ quán thường chuyển khoản thẳng từ tài khoản cá nhân của chủ.

- Nếu Module 3 không có trường phân loại Nguồn tiền thanh toán, Module 4 sẽ không biết khoản nhập hàng nào cần trừ vào tiền mặt trong két thu ngân!

## 2. UX thực tế khả thi & Giải pháp xử lý

- Tách bạch hoàn toàn Thanh Lọc (trên Base Table) và Ô Chọn Món (trong Drawer):

- Trên màn hình chính (Base Table): Thanh tìm kiếm chỉ làm đúng một nhiệm vụ duy nhất là Lọc và tra cứu lịch sử (kết hợp lọc Ngày/Tháng/Năm và từ khoá Tên món hàng). Phía dưới bảng có dòng tổng kết: Tổng tiền nhập hàng trong kỳ đang lọc.

- Bên trong Drawer "Thêm mới" (mở từ bên phải): Đây mới là nơi áp dụng cơ chế gọi lại Master Data thông minh của bạn! Ô nhập Tên món hàng trong Drawer là một Combobox (Vừa gõ tìm kiếm, vừa cho phép tạo mới):

- Khi nhân viên gõ chữ "Bò...", dropdown xổ xuống các món đã có trong Master Data (ví dụ: "Ba chỉ bò Mỹ (Kg)").

- Khi nhân viên bấm chọn "Ba chỉ bò Mỹ (Kg)", hệ thống tự động điền sẵn luôn Đơn vị tính: Kg và gợi ý Đơn giá của lần nhập gần nhất (nhân viên chỉ cần gõ Số lượng là tự nhảy ra Thành tiền).

- Nếu nhân viên gõ một món hoàn toàn mới chưa có trong hệ thống, dropdown hiện nút + Lưu "[Tên món mới]" vào Master Data và chọn.

- Bổ sung trường "Nguồn tiền chi" trong Drawer: Gồm 2 lựa chọn Radio button:

- 1. Lấy tiền mặt từ Két thu ngân (mặc định chọn sẵn — tự động khấu trừ vào Module 4 khi Kết ca).

- 2. Quỹ ngoài / Chủ chuyển khoản (chỉ ghi nhận chi phí nhập hàng, không đụng tới tiền mặt trong két thu ngân).

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Biến Drawer thành một "Giỏ nhập hàng nhanh", vừa giữ đúng ý tưởng tái sử dụng tên món hàng từ Master Data của bạn, vừa nối liền mạch dữ liệu chi tiêu sang Module 4.

- UX (10/10): Nhân viên nhập một phiếu chợ 5 món chỉ mất 15 giây nhờ tính năng tự gợi ý đơn giá cũ, không bao giờ bị nhầm lẫn giữa việc tìm kiếm lịch sử và thêm mới.

## Module 4: Ngân sách và Dòng tiền (Đối soát Kết ca)

## 1. Vấn đề thực tế & Hành vi người dùng

## GAP 4.1: Sai số toán học tất yếu trong thuật toán "Kết ca" Theo mô tả của bạn:

- 1. "Dòng tiền" = Tổng tất cả các hoá đơn thu được trong ngày + Ngân sách mặc định đầu ngày.

- 2. Khi bấm "Kết ca", hệ thống lấy Tiền đếm được trong két trừ đi Ngân sách mặc định đầu ngày, rồi lấy phần còn lại so sánh với Tổng tất cả các hoá đơn trong ngày để kết luận Dư (lớn hơn 0), Thiếu (nhỏ hơn 0), hay Chuẩn (bằng 0).

ế

ầ


## Hãy nhìn vào thực tế vận hành tại quầy thu ngân:

- Sai lầm thứ nhất (Tiền Chuyển khoản QR): Ở Module 1, bạn có làm tính năng in mã QR chuyển khoản trên hoá đơn. Khi khách quét mã QR chuyển khoản 200.000đ, số tiền 200.000đ này nằm trong tài khoản ngân hàng, không hề có một tờ tiền giấy nào chui vào trong két sắt của thu ngân. Thế nhưng thuật toán của bạn lại cộng cả hoá đơn 200.000đ này vào tổng hoá đơn để bắt thu ngân phải có đủ số tiền mặt đó trong két! Kết quả là cứ có 1 khách chuyển khoản là cuối ngày két bị báo THIẾU tiền.

- Sai lầm thứ hai (Tiền mặt lấy ra từ két để chi tiêu/mua hàng): Chính bạn đã định nghĩa rất đúng thực tế: "Ngân sách hàng ngày là tiền mặc định để vào két mỗi ngày dùng cho thối tiền; chi tiền; mua sắm trong ngày của cửa hàng". Giả sử đầu ngày bỏ vào két 1.000.000đ. Trong ngày quán không bán được đơn nào cả (Tổng hoá đơn = 0đ), nhưng nhân viên mở két lấy 200.000đ đi mua đá bi và túi nilon (đã nhập vào Module 3). Cuối ngày đếm két còn 800.000đ. Theo công thức của bạn, hệ thống bắt giữ lại 1.000.000đ ngân sách mặc định nên sẽ báo két THIẾU -200.000đ — trong khi thực tế két hoàn toàn CHUẨN vì 200.000đ đó đã biến thành phiếu nhập hàng hợp lệ!

## GAP 4.2: Lỗ hổng "Giam tiền" hoặc "Hụt tiền lẻ mở ca ngày mai"

- Nếu trong ngày đã chi mất 400.000đ tiền mua nguyên liệu mà không bán được nhiều tiền mặt, hoặc khi kết ca bị thiếu hụt, làm sao đảm bảo sáng ngày hôm sau trong két vẫn có đúng mức Ngân sách mặc định để thối tiền cho khách?

## 2. UX thực tế khả thi & Giải pháp xử lý

- Chuẩn hoá lại Công thức Toán học của nút "Kết ca": Hệ thống tách bạch rõ Dòng tiền mặt tại két (Cash Drawer) và Doanh thu Ngân hàng (Bank Transfer):

```
Tiền mặt lý thuyết phải có trong két = Ngân sách đầu ca
+ Tổng Hoá đơn thu bằng TIỀN MẶT
- Tổng Phiếu nhập hàng (Module 3) lấy từ TIỀN KÉT
```

Chênh lệch kết ca = Tiền mặt thực đếm trong két - Tiền mặt lý thuyết phải có trong két

- Nếu Chênh lệch bằng 0 → Tình trạng: Chuẩn (Badge Xanh lá).

- Nếu Chênh lệch lớn hơn 0 → Tình trạng: Dư (Badge Vàng - ghi rõ số tiền dư).

- Nếu Chênh lệch nhỏ hơn 0 → Tình trạng: Thiếu (Badge Đỏ - ghi rõ số tiền thiếu).

- Thiết kế UX cho Component "Kết ca" thực tế:

- Thay vì chỉ có 1 ô nhập tổng tiền, hãy làm một nút nhỏ "Mở bảng đếm tiền theo mệnh giá" bên cạnh ô nhập: Thu ngân chỉ cần nhập số tờ 500k, 200k, 100k, 50k, 20k, 10k, 5k, 2k, 1k — hệ thống tự nhân và cộng tổng ra số Tiền đếm được trong két (loại bỏ hoàn toàn lỗi thu ngân bấm máy tính nhầm khi đếm cọc tiền dày lúc 10h đêm mệt mỏi).

- Sau khi bấm "Kết ca", màn hình hiển thị rõ 2 con số hành động thực tế cho thu ngân:

```
1. Giữ lại trong két cho ngày mai (Ngân sách mặc định): Ví dụ 1.000.000đ.
2. Số tiền mặt rút ra nộp cho Chủ quán / Quản lý: Bằng Tiền đếm được trong két - 1.000.000đ.
```

- Nâng cấp cấu trúc Base Table của Module 4: Các cột bao gồm: Ngày/Ca, Ngân sách đầu ca, Thu tiền mặt (+), Thu chuyển khoản (QR), Chi tại két (-), Tiền mặt lý thuyết, Tiền thực đếm, Chênh lệch / Tình trạng (Chuẩn/Dư/Thiếu).

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Khớp nối hoàn hảo dữ liệu của 3 Module quan trọng nhất: Module 1 (Hoá đơn) + Module 3 (Nhập hàng) = Module 4 (Dòng tiền kết ca).

- UX (10/10): Minh bạch tuyệt đối, thu ngân tâm phục khẩu phục với con số đối soát cuối ngày, chủ quán nhìn vào bảng thấy ngay hôm nay thu được bao nhiêu tiền mặt, bao nhiêu chuyển khoản, chi chợ hết bao nhiêu.

## Module 5 & Module 9: Quản lý Nhân viên & Hồ sơ Tài khoản

## 1. Vấn đề thực tế & Hành vi người dùng

GAP 5.1: Sự chồng chéo và đứt gãy giữa "Nhân viên (Module 5)", "Tài khoản (Module 8)" và "Hồ sơ cá nhân (Module 9)"

- Bạn thiết kế:

- Module 5 (Quản lý nhân viên): Nhập Tên nhân viên, Ngày tháng năm sinh, Nơi ở, Số CCCD (nơi cấp), Chức vụ, Chuyên môn, SĐT, Ngày vào làm, Ghi chú, File đính kèm.

- Module 8 (Phân quyền): Có nút "Thêm mới" để tạo một tài khoản đăng nhập hệ thống.

- Module 9 (Hồ sơ tài khoản trên Navbar): Lại có Họ và tên, Ngày tháng năm sinh, SĐT, Chuyên môn (mapping từ quản lý thành viên - readonly), Nơi ở, Số CCCD, Nơi cấp, Thông tin ngân hàng, Ảnh đại diện.

- Vấn đề thực tế xảy ra khi sử dụng:

- 1. Không phải nhân viên nào cũng có tài khoản đăng nhập: Nhân viên đứng bếp chiên hoặc nhân viên bưng bê chạy bàn theo giờ chỉ cần có hồ sơ trong Module 5 để quản lý xếp lịch làm việc ở Module 6 và trả lương. Họ không có (và không nên có) tài khoản đăng nhập vào web quản trị.

- 2. Đặt nhầm chỗ trường "Thông tin ngân hàng": Bạn đặt Thông tin ngân hàng ở Module 9 (Hồ sơ tài khoản cá nhân) mà quên đặt ở Module 5 (Quản lý nhân viên). Vậy với những nhân viên chạy bàn không có tài khoản đăng nhập để vào Module 9, chủ quán

ố

ể

ố


sẽ lưu số tài khoản ngân hàng của họ ở đâu để trả lương cuối tháng? Và ngay cả với nhân viên có tài khoản, khi chủ quán vào Module 5 bấm nút "Eye" xem chi tiết nhân viên, chủ quán cũng cần thấy ngay Thông tin ngân hàng của họ!

- 3. Bẫy tìm kiếm "2 bộ lọc Dropdown (Tên nhân viên HOẶC Chuyên môn)" ở Module 5: Bạn mô tả ở phần bên trái thanh search có 2 bộ lọc dưới dạng dropdown (Tên nhân viên hoặc Chuyên môn) và các giá trị search phải nằm trong filter đó, trong khi câu trước bạn lại nói "thanh tìm kiếm với giá trị là Tên nhân viên và chức vụ và chuyên môn". Nếu gộp tất cả vào 1 ô tìm kiếm duy nhất, bạn không thể lọc kiểu: "Hiển thị tất cả nhân viên có Chức vụ là Part-time VÀ Chuyên môn là Bếp nấu".

## 2. UX thực tế khả thi & Giải pháp xử lý

## Đồng nhất 1 bảng dữ liệu gốc (Single Source of Truth):

- Bổ sung trường Thông tin ngân hàng (Tên ngân hàng, Số tài khoản, Chủ tài khoản) và Ảnh đại diện (Avatar) vào ngay form Thêm/Sửa của Module 5 (Quản lý nhân viên).

- Khi Admin tạo tài khoản đăng nhập ở Module 8, Admin chỉ cần chọn nhân viên tương ứng từ danh sách Module 5 (quan hệ 1-1).

- Khi nhân viên đó đăng nhập và vào Module 9 (Hồ sơ tài khoản), trang này đọc trực tiếp dữ liệu từ hồ sơ nhân viên của họ ở Module 5. Các trường nhạy cảm do Admin quản lý (Chức vụ, Chuyên môn, Ngày vào làm) sẽ ở chế độ readonly như bạn thiết kế; còn các trường cá nhân (SĐT, Nơi ở, Thông tin ngân hàng, Avatar) khi nhân viên tự cập nhật ở Module 9 sẽ tự động đồng bộ sang Module 5 cho Admin thấy.

- Cải tiến Thanh Tìm kiếm & Bộ lọc ở Module 5:

- Để 2 Dropdown lọc riêng biệt cho Chức vụ (Tất cả / Quản lý / Thu ngân / Phục vụ...) và Chuyên môn (Tất cả / Bếp nấu / Bếp chiên / Pha chế...) nằm cạnh Ô nhập từ khoá tìm kiếm Tên / SĐT nhân viên.

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Tránh việc phải tạo 2 bảng trùng lặp các cột Họ tên, CCCD, Ngày sinh, Nơi ở, chuẩn hoá hoàn toàn Database (3NF).

- UX (10/10): Chủ quán không phải nhập đi nhập lại thông tin của 1 người ở 2 màn hình khác nhau.

## Module 6: Lịch làm việc (Giao diện dạng Bảng Excel)

## 1. Vấn đề thực tế & Hành vi người dùng

## GAP 6.1: "Một ô = Một Dropdown đơn" làm sập bài toán xếp ca nhiều người

- Bạn mô tả bảng gồm 7 cột (7 ngày trong tuần) và các dòng là các Khung giờ, các dữ liệu trong bảng hiển thị dưới dạng dropdown chọn tên viết tắt (V.Anh).

- Thực tế tại quán mì cay: Trong một khung giờ (ví dụ Ca Tối: 17:00 - 22:00 ngày Thứ Sáu), quán không thể chỉ có 1 người đi làm! Một ca hoạt động bắt buộc phải có ít nhất 4 đến 6 nhân viên cùng làm việc (1 Thu ngân, 1 Bếp nấu, 1 Bếp chiên, 1 Pha chế, 2 Phục vụ).

- Nếu mỗi ô giao giữa Khung giờ và Ngày chỉ là một dropdown chọn 1 giá trị đơn (Single-select), bạn sẽ không có cách nào xếp được 5 nhân viên vào cùng Ca Tối Thứ Sáu!

## GAP 6.2: Mất thông tin "Chuyên môn" và Trùng tên viết tắt khi nhìn vào V.Anh

- Thuật toán biến Nguyễn Văn Anh thành V.Anh giúp ô bảng rất gọn. Nhưng hãy đặt mình vào vị trí người xếp lịch:

- Quán có Nguyễn Văn Anh, Trần Văn Anh và Lê Việt Anh. Cả 3 người khi đưa qua hàm rút gọn đều biến thành V.Anh! Trong dropdown lúc này xuất hiện 3 dòng V.Anh giống hệt nhau, người xếp lịch không biết chọn ai.

- Quan trọng hơn: Khi nhìn vào ô Ca Tối Thứ Sáu thấy có 4 cái tên V.Anh, H.Bình, M.Tâm, K.Linh, người quản lý không thể nhìn ra được ca đó đã có người đứng Bếp chiên hay chưa, hay cả 4 bạn đó đều là nhân viên Phục vụ!

## GAP 6.3: Thiếu chiều "Thời gian theo Tuần (Week Navigation)"

- Nếu bảng chỉ cố định 7 cột (Thứ 2 đến Chủ Nhật) mà không lưu theo Tuần của Năm (ví dụ: Tuần 45: 02/11/2026 - 08/11/2026), thì Chủ Nhật hàng tuần khi quản lý vào sửa lịch cho tuần mới, toàn bộ lịch làm việc của tuần cũ sẽ bị ghi đè mất sạch — cuối tháng không còn dữ liệu lịch sử để tính số ca làm việc trả lương cho nhân viên!

## 2. UX thực tế khả thi & Giải pháp xử lý

- Giải pháp cấu trúc bảng (2 phương án UX cực mượt để bạn chọn):

- Phương án A (Chia dòng theo Khung giờ + Vị trí chuyên môn): Cột đầu tiên bên trái chia theo cấu trúc nhóm: Trong Ca Sáng (08:00 - 15:00) có các dòng con cố định là Bếp nấu, Bếp chiên, Pha chế, Thu ngân, Phục vụ. Khi bấm vào ô giao giữa dòng Bếp nấu và Thứ 2, dropdown tự động ưu tiên lọc những nhân viên có chuyên môn là Bếp nấu!

- Phương án B (Giữ nguyên dòng là Khung giờ, dùng Multi-Select Tags có màu theo Chuyên môn): Mỗi ô là một Multi-select Dropdown cho phép chọn nhiều nhân viên vào cùng 1 ô. Mỗi nhân viên được chọn sẽ hiển thị thành một Tag (Chip) có màu sắc đại diện cho chuyên môn của họ kèm tên viết tắt, ví dụ: [ V.Anh] (Đỏ - Bếp nấu), [ T.Bình] (Vàng - Bếp chiên), [ M.Linh] (Xanh - Pha chế).

- Thuật toán chống trùng tên viết tắt (Smart Abbreviation Collision Handling):

- Mặc định rút gọn thành [Chữ cái đầu tên lót].[Tên] (ví dụ V.Anh).


- Hệ thống tự động quét danh sách nhân viên đang làm việc: nếu phát hiện có từ 2 người trở lên trùng tên viết tắt V.Anh, hệ thống tự động nối thêm chữ cái đầu của Họ và mã định danh nhỏ: N.V.Anh (#12) và T.V.Anh (#15). Khi di chuột (hover) hoặc mở dropdown tìm kiếm, hiển thị đầy đủ "V.Anh — Nguyễn Văn Anh (Bếp nấu)" để tìm kiếm chính xác.

- Thêm Thanh điều hướng Tuần (Week Picker) & Nút "Sao chép lịch tuần trước":

- Đặt thanh chuyển tuần (Tuần trước | 02/11 - 08/11/2026 | Tuần sau) ở đầu bảng.

- Thêm nút "Sao chép từ tuần trước": Vì lịch làm việc của quán thường cố định 70% qua các tuần, quản lý chỉ cần bấm 1 nút để copy lịch tuần trước sang tuần mới, sau đó chỉnh sửa vài ô của các bạn xin nghỉ phép rồi bấm "Lưu" (vẫn giữ nguyên cơ chế cảnh báo Unsaved Changes bằng beforeunload và Router Blocker rất hay của bạn).

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Lưu dữ liệu lịch làm việc theo cấu trúc (week_start_date, day_of_week, shift_id, employee_id) trong Database cực kỳ gọn nhẹ.

- UX (10/10): Giải quyết triệt để bài toán xếp nhiều người trong 1 ca và giúp người quản lý nhìn bằng mắt thường trong 2 giây là biết ca nào đang thiếu vị trí bếp nào.

## Module 7 & Module 8: Master Data (MDM) & Phân quyền hệ thống (RBAC)

## 1. Vấn đề thực tế & Hành vi người dùng

## GAP 7.1: Rác dữ liệu Master Data do lỗi gõ phím của nhân viên

- Bạn cho phép nhân viên ở trang Nhập hàng (Module 3) và Quản lý nhân viên (Module 5) nếu không thấy giá trị trong Master Data thì tự nhập và hệ thống tự động lưu vào MDM.

- Thực tế: Nhân viên ca sáng gõ "Tương ớt", nhân viên ca tối gõ "tương ớt " (dư dấu cách cuối), hôm sau gõ "Tuong ot". Sau 1 tháng, dropdown Master Data sẽ bị rác và trùng lặp. Hơn nữa, nếu một nhân viên thu ngân bình thường có quyền thêm phiếu nhập hàng mà cũng tự ý tạo được Master Data vô tội vạ thì danh mục chuẩn của Admin sẽ bị phá vỡ.

## GAP 8.1: Bẫy "Chặn quyền trang Master Data làm liệt luôn Dropdown ở các trang khác"

- Ở Module 8, bạn thiết kế phân quyền theo từng màn hình (Checkbox màn hình + Dropdown CRUD).

- Tình huống xung đột kỹ thuật: Admin chỉ cấp quyền cho tài khoản Thu ngân vào 2 màn hình là Hoá đơn điện tử (Module 1) và Nhập hàng (Module 3), hoàn toàn không tích chọn màn hình Master Data (Module 7).

- Khi Thu ngân vào màn hình Nhập hàng (Module 3) và bấm "Thêm mới", giao diện Drawer cần gọi API lấy danh sách Tên món hàng từ Master Data để hiển thị trong dropdown. Nếu ở Backend bạn dùng chung 1 quyền master_data:read cho cả trang quản trị Module 7 lẫn API lấy dropdown, API sẽ trả về lỗi không đủ quyền hạn và Thu ngân không thể chọn được món hàng nào để nhập!

## GAP 8.2: Lỗ hổng phân quyền trên cùng một màn hình (Module 4)

- Ở Module 4 (Ngân sách & Dòng tiền), bạn quy định: "Ngân sách mặc định mà Admin nhập vào", còn Thu ngân thì vào nhập tiền đếm được trong két và bấm "Kết ca".

- Như vậy, cả Admin và Thu ngân đều cần vào Màn hình số 4 và đều cần quyền Create/Update trên màn hình này. Nếu ở Module 8 bạn chỉ chia quyền ở mức CRUD cho cả màn hình số 4, thì khi cấp quyền Update cho Thu ngân để họ bấm Kết ca, Thu ngân cũng sẽ sửa được luôn con số "Ngân sách mặc định đầu ngày" của Admin!

## 2. UX thực tế khả thi & Giải pháp xử lý

- Chuẩn hoá chuỗi (Normalize) trước khi lưu vào Master Data:

- Tự động cắt khoảng trắng thừa (trim()), viết hoa chữ cái đầu (Title Case), và khi tìm kiếm trong dropdown thì hỗ trợ tìm kiếm không dấu (gõ mi cay vẫn ra Mì cay) để nhân viên thấy ngay mục đã có sẵn, hạn chế tối đa việc tạo trùng.

- Trong bảng Master Data (Module 7), thêm cột Trạng thái (Đang dùng / Ẩn) thay vì xoá cứng khỏi Database, để khi ngừng nhập một mặt hàng thì các phiếu nhập hàng cũ từ năm ngoái không bị mất tên.

- Tách quyền Quản trị MDM và API Lấy danh mục (Lookup API):

- Quyền tích chọn trang Master Data (Module 7) chỉ kiểm soát việc ai được nhìn thấy trang Master Data trên Sidebar và sửa/xoá danh mục gốc. Còn API lấy dữ liệu đổ vào dropdown (GET /api/mdm/options?category=...) được mở cho mọi tài khoản đã đăng nhập hợp lệ.

- Nâng cấp cấu trúc quyền trong Drawer của Module 8:

- Bên cạnh 4 quyền cơ bản Xem (Read) - Thêm (Create) - Sửa (Update) - Xoá (Delete), hỗ trợ thêm các Quyền nghiệp vụ con (Sub-permissions) ngay dưới màn hình tương ứng:

- Dưới màn hình Ngân sách & Dòng tiền: Có thêm checkbox [ ] Cấu hình ngân sách mặc định đầu ngày (chỉ Admin có).

- Dưới màn hình Hoá đơn: Có thêm checkbox [ ] Huỷ hoá đơn đã thanh toán.

- Sử dụng mã chuẩn 403 Forbidden khi đã đăng nhập nhưng truy cập trái phép vào link "/" hoặc các route bị khoá (giữ mã 401 Unauthorized cho trường hợp chưa đăng nhập hoặc hết hạn token).

## 3. Đánh giá mức độ tương thích


- Hệ thống (10/10): Kiến trúc Permission-based (resource:action, ví dụ cashflow:create_settlement tách biệt với cashflow:update_default_budget) cực kỳ sạch sẽ trong Middleware của Backend.

- UX (9.5/10): Giữ đúng giao diện Drawer có Checkbox và Dropdown như bạn mong muốn nhưng chặn đứng mọi kẽ hở lạm quyền của nhân viên.

## Module 9: Navbar, Tìm kiếm Sidebar, Resize Cột & Đăng xuất

## 1. Vấn đề thực tế & Hành vi người dùng

GAP 9.1: Xung đột giữa tính năng "Xoá bộ nhớ đệm khi Đăng xuất" và "Resize cột / Sidebar / Dark Mode"

- Bạn có 2 yêu cầu trong thiết kế:

- 1. Cho phép người dùng chuyển đổi Theme Sáng/Tối và kéo giãn (resize) độ rộng các cột Base Table cũng như Sidebar.

- 2. Khi bấm Đăng xuất thì "xoá luôn bộ nhớ đệm của tài khoản đó".

- Vấn đề thực tế: Trên trình duyệt web, cấu hình độ rộng cột sau khi kéo giãn (columnSizing), độ rộng Sidebar (sidebarWidth) và chế độ Sáng/Tối (theme) thường được lưu vào localStorage. Nếu khi bấm Đăng xuất bạn gọi lệnh xoá trắng toàn bộ localStorage của trình duyệt, thì mỗi lần nhân viên kết ca và bấm Đăng xuất, tất cả các cột bảng đã căn chỉnh đẹp đẽ và chế độ Dark Mode sẽ bị mất sạch, quay về mặc định ban đầu! Người dùng sẽ rất bực mình vì ngày nào vào ca cũng phải ngồi kéo lại từng cột bảng.

## GAP 9.2: Thanh tìm kiếm Category trên Navbar hiển thị cả các màn hình bị cấm

- Khi bấm vào thanh search nhỏ trên Navbar, một pop-up hiện ra cho phép gõ tìm nhanh các màn hình (Category từ Sidebar). Nếu danh sách trong pop-up này lấy từ mảng cấu hình tĩnh (Static Routes) mà quên lọc qua danh sách phân quyền của Module 8, nhân viên thu ngân bấm vào sẽ thấy hiện ra cả trang "Phân quyền hệ thống" và "Quản lý nhân viên".

## 2. UX thực tế khả thi & Giải pháp xử lý

- Cơ chế Xoá bộ nhớ đệm có chọn lọc (Selective Cache Purge khi Đăng xuất):

- Những gì BẮT BUỘC XOÁ sạch khi Đăng xuất: Access Token, Refresh Token, Thông tin hồ sơ người dùng đang đăng nhập, Danh sách quyền RBAC, và toàn bộ bộ nhớ đệm dữ liệu API (như React Query / TanStack Query cache hoặc Redux/Zustand store chứa danh sách hoá đơn, nhân viên) để người đăng nhập sau không bao giờ nhìn thấy dữ liệu nhạy cảm của người trước.

- Những gì GIỮ LẠI (hoặc gắn theo ID tài khoản): Lưu cấu hình giao diện theo cấu trúc key định danh ui_prefs_[user_id] (bao gồm: theme, sidebar_width, table_columns_width). Khi bấm Đăng xuất, không xoá key này. Lần tới khi đúng tài khoản đó đăng nhập lại, hệ thống đọc lại ui_prefs_[user_id] và khôi phục chính xác độ rộng từng cột bảng mà họ đã kéo!

- Đồng bộ thanh Search Navbar (Command Palette) với Phân quyền:

- Lọc mảng kết quả tìm kiếm trong Pop-up theo điều kiện userPermissions.includes(screen.readPermission).

- Bổ sung phím tắt Ctrl + K (hoặc Cmd + K) để người dùng có thể mở nhanh Pop-up tìm kiếm màn hình mà không cần di chuột lên góc phải Navbar, kèm nút "Đổi mật khẩu" ngay trong trang Hồ sơ tài khoản.

## 3. Đánh giá mức độ tương thích

- Hệ thống (10/10): Tách biệt rõ ràng giữa Application Data Cache (Bộ nhớ đệm dữ liệu) và UI State Persistence (Cấu hình giao diện).

- UX (10/10): Đảm bảo an toàn bảo mật tuyệt đối khi dùng chung 1 máy tính ở quầy thu ngân giữa nhiều ca làm việc mà vẫn giữ trọn vẹn trải nghiệm cá nhân hoá giao diện.

## Bảng tổng hợp Đánh giá Tương thích & Tác động của các Giải pháp

| Module | Lỗ hổng cốt lõi được xử lý | Giải pháp UX / Kỹ thuật áp dụng | Độ tương thích | Điểm nâng cấp UX |
| --- | --- | --- | --- | --- |
|   |   |   | Hệ thống | thực tế |
| 0 & 1. Đặt món | Kẹt luồng in QR thanh toán; nấu | Tách nút In tạm tính (QR); chỉ tách | 10/10 (Rất khớp) | 10/10 (Chống thất |
| & POS | trùng món khi gọi thêm | bếp các món Mới gọi (Delta) |   | thoát & nhầm món) |
| 2. Hoá đơn | Dropdown tìm kiếm 1 điều kiện gây | Tách Lịch chọn ngày cố định kết hợp | 10/10 (Tối ưu | 9.5/10 (Tìm đơn trong |
|   | tắc nghẽn tra cứu | Ô tìm kiếm từ khoá | SQL) | 3 giây) |
| 3. Nhập hàng | Nhầm lẫn giữa tìm lịch sử trên bảng | Đưa Combobox Tìm & Tự lưu MDM | 10/10 (Chuẩn | 10/10 (Tự gợi ý đơn |
|   | và thêm món mới | vào trong Drawer Thêm mới | luồng) | giá cũ) |
| 4. Dòng tiền | Báo thiếu tiền ảo do gộp đơn QR và | Công thức Kết ca tách Tiền mặt / QR | 10/10 (Liên | 10/10 (Chính xác |
|   | quên trừ tiền chợ | và trừ Chi tại két | thông) | 100% tới từng đồng) |
| 5, 6 & 9. Nhân | 1 ô lịch chỉ chọn được 1 người; | Ô lịch Multi-select có màu chuyên | 9.5/10 (Dễ mở | 10/10 (Nhìn ngay ca |
| sự | trùng tên V.Anh | môn; tự xử lý trùng tên tắt | rộng) | thiếu bếp nào) |
| 7 & 8. MDM & | Khoá trang MDM làm sập | Tách Lookup API; thêm Sub- | 10/10 (Chuẩn | 9.5/10 (An toàn & |
| Quyền | dropdown; lộ quyền sửa ngân sách | permission; xoá Cache giữ UI | RBAC) | mượt mà) |

ấ

ầ


User prompt: Xuất ra tài liệu giải pháp đầy đủ giúp mình nhé.

## Response: TÀI LIỆU ĐẶC TẢ GIẢI PHÁP KỸ THUẬT & NGHIỆP VỤ (SRS & SAD)

Dự án: Hệ thống Đặt món QR, POS Thu ngân & Quản trị Vận hành Cửa hàng FnB (Mô hình Mì cay - Đồ chiên - Pha chế)

## PHẦN 1: TỔNG QUAN KIẾN TRÚC HỆ THỐNG

## 1.1. Mô hình vận hành thực tế

Hệ thống phục vụ mô hình cửa hàng FnB chia làm 3 khu vực chế biến độc lập (Bếp nấu mì cay, Bếp chiên, Quầy pha chế) và Quầy thu ngân trung tâm:

- 1. Khách hàng tại bàn: Quét mã QR định danh bàn trên điện thoại → Chọn món, cấp độ cay, topping → Gửi đơn đặt hàng.

- 2. Thu ngân (POS Trung tâm): Nhận đơn thời gian thực (kèm âm báo) → Xác nhận đơn → Bấm Tách đơn để hệ thống tự động phân loại món theo 3 khu vực bếp và in ra 3 phiếu chế biến riêng biệt (có logo nhận diện từng bếp) → In phiếu tạm tính kèm mã VietQR động cho khách kiểm tra và thanh toán → Chốt thanh toán và đóng đơn.

- 3. Quản trị vận hành (Back-Office): Quản lý lịch sử hóa đơn, nhập hàng nguyên vật liệu gắn với Master Data, đối soát dòng tiền và kết ca hàng ngày, quản lý hồ sơ nhân sự, xếp lịch làm việc dạng bảng Excel và phân quyền chi tiết đến từng thao tác.

## 1.2. Kiến trúc kỹ thuật đề xuất (Tech Stack)

- Frontend: React / Next.js (TypeScript), TailwindCSS, TanStack Table (hỗ trợ kéo giãn cột, lọc đa điều kiện), TanStack Query (quản lý bộ nhớ đệm dữ liệu), Zustand (quản lý trạng thái giao diện).

- Backend: Node.js (NestJS / Express với TypeScript), RESTful API kết hợp WebSockets (Socket.io) để đẩy thông báo đơn hàng QR theo thời gian thực xuống màn hình thu ngân.

- Cơ sở dữ liệu: PostgreSQL (đảm bảo tính toàn vẹn giao dịch ACID cho hóa đơn và dòng tiền kết ca).

- Giải pháp In ấn & Thanh toán: Tích hợp chuẩn VietQR (tạo mã QR chuyển khoản động theo số tiền từng đơn) và cơ chế in nhiệt khổ 80mm tự động cắt giấy theo từng khu vực bếp.

## PHẦN 2: THIẾT KẾ CƠ SỞ DỮ LIỆU CHUẨN HÓA (DATABASE SCHEMA)

Thiết kế dưới đây giải quyết triệt để toàn bộ các lỗ hổng nghiệp vụ: hỗ trợ gọi thêm món nhiều lượt trên cùng một bàn, tách món theo khu vực bếp, liên kết 1-1 giữa Nhân viên và Tài khoản, tách bạch doanh thu Tiền mặt và Chuyển khoản khi kết ca.

```
-- 1. NHÓM MASTER DATA & CẤU HÌNH HỆ THỐNG
CREATE TABLE master_data (
id SERIAL PRIMARY KEY,
category VARCHAR(50) NOT NULL, -- POSITION, SPECIALTY, INGREDIENT, UNIT
name VARCHAR(150) NOT NULL,
normalized_name VARCHAR(150) NOT NULL, -- Chuỗi không dấu viết thường để chống trùng lặp
metadata JSONB DEFAULT '{}', -- Lưu đơn vị tính mặc định hoặc đơn giá nhập gần nhất
is_active BOOLEAN DEFAULT TRUE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(category, normalized_name)
);
-- 2. NHÓM NHÂN SỰ, TÀI KHOẢN & PHÂN QUYỀN (MODULES 5, 6, 8, 9)
CREATE TABLE employees (
id SERIAL PRIMARY KEY,
full_name VARCHAR(100) NOT NULL,
short_name VARCHAR(30) NOT NULL, -- Tự động sinh: V.Anh, N.V.Anh (#12)
dob DATE NOT NULL,
phone VARCHAR(20) NOT NULL,
address TEXT,
citizen_id VARCHAR(20) UNIQUE,
citizen_id_issued_place VARCHAR(100),
position_id INT REFERENCES master_data(id),
specialty_id INT REFERENCES master_data(id),
start_date DATE NOT NULL,
bank_name VARCHAR(100),
bank_account_no VARCHAR(50),
bank_account_name VARCHAR(100),
avatar_url TEXT,
attachment_urls JSONB DEFAULT '[]',
note TEXT,
is_deleted BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE users (
id SERIAL PRIMARY KEY,
```


```
employee_id INT UNIQUE REFERENCES employees(id), -- Liên kết 1-1 với hồ sơ nhân viên
username VARCHAR(50) UNIQUE NOT NULL,
password_hash TEXT NOT NULL,
is_super_admin BOOLEAN DEFAULT FALSE, -- Readonly quyền hạn nếu là TRUE
permissions JSONB NOT NULL DEFAULT '{}', -- Lưu ma trận CRUD và Sub-permissions
ui_preferences JSONB DEFAULT '{}', -- Lưu theme, độ rộng sidebar và các cột bảng
is_active BOOLEAN DEFAULT TRUE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE shift_definitions (
id SERIAL PRIMARY KEY,
name VARCHAR(50) NOT NULL, -- Ca Sáng (08:00 - 15:00), Ca Tối (15:00 - 22:00)
start_time TIME NOT NULL,
end_time TIME NOT NULL,
sort_order INT DEFAULT 0
);
CREATE TABLE work_schedules (
id SERIAL PRIMARY KEY,
week_start_date DATE NOT NULL, -- Ngày Thứ Hai đầu tuần để quản lý lịch sử theo tuần
day_of_week SMALLINT NOT NULL, -- Từ 2 (Thứ Hai) đến 8 (Chủ Nhật)
shift_id INT REFERENCES shift_definitions(id),
employee_id INT REFERENCES employees(id),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(week_start_date, day_of_week, shift_id, employee_id)
);
-- 3. NHÓM BÀN, THỰC ĐƠN & TOPPING (MODULE 0)
CREATE TABLE dining_tables (
id SERIAL PRIMARY KEY,
name VARCHAR(50) NOT NULL, -- Bàn 01, Bàn 02, Mang về
qr_token VARCHAR(100) UNIQUE NOT NULL, -- Mã bảo mật chống đặt đơn ảo từ xa
status VARCHAR(20) DEFAULT 'AVAILABLE' -- AVAILABLE, OCCUPIED
);
CREATE TABLE products (
id SERIAL PRIMARY KEY,
name VARCHAR(150) NOT NULL,
price NUMERIC(12, 2) NOT NULL,
station VARCHAR(30) NOT NULL, -- BEP_NAU, BEP_CHIEN, PHA_CHE, COMBO
is_available BOOLEAN DEFAULT TRUE,
image_url TEXT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE combo_items (
parent_product_id INT REFERENCES products(id),
child_product_id INT REFERENCES products(id),
quantity INT NOT NULL DEFAULT 1,
PRIMARY KEY (parent_product_id, child_product_id)
);
CREATE TABLE modifier_groups (
id SERIAL PRIMARY KEY,
name VARCHAR(100) NOT NULL, -- Cấp độ cay, Thêm Topping
is_required BOOLEAN DEFAULT FALSE,
max_select INT DEFAULT 1
);
CREATE TABLE modifiers (
id SERIAL PRIMARY KEY,
group_id INT REFERENCES modifier_groups(id),
name VARCHAR(100) NOT NULL, -- Cấp 1, Cấp 2, Thêm Bò viên
extra_price NUMERIC(12, 2) DEFAULT 0
);
-- 4. NHÓM ĐẶT MÓN, TÁCH BẾP & HÓA ĐƠN (MODULES 1, 2)
CREATE TABLE orders (
id SERIAL PRIMARY KEY,
order_code VARCHAR(30) UNIQUE NOT NULL, -- HD-20261105-001
table_id INT REFERENCES dining_tables(id),
status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, SERVING, PAID, VOIDED
payment_method VARCHAR(30), -- CASH, TRANSFER, SPLIT
cash_amount NUMERIC(12, 2) DEFAULT 0,
transfer_amount NUMERIC(12, 2) DEFAULT 0,
total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
note TEXT,
void_reason TEXT,
```


```
cashier_id INT REFERENCES users(id),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
paid_at TIMESTAMP
);
CREATE TABLE order_items (
id SERIAL PRIMARY KEY,
order_id INT REFERENCES orders(id) ON DELETE CASCADE,
product_id INT REFERENCES products(id),
quantity INT NOT NULL,
unit_price NUMERIC(12, 2) NOT NULL,
modifiers_snapshot JSONB DEFAULT '[]', -- Lưu cấp độ cay, topping đã chọn
item_note TEXT,
batch_no INT NOT NULL DEFAULT 1, -- Lượt gọi món (Lượt 1, Lượt 2...)
kitchen_status VARCHAR(30) DEFAULT 'NEW', -- NEW (Chưa tách bếp), PRINTED (Đã in bếp), CANCELLED
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 5. NHÓM NHẬP HÀNG & DÒNG TIỀN KẾT CA (MODULES 3, 4)
CREATE TABLE inventory_imports (
id SERIAL PRIMARY KEY,
ingredient_mdm_id INT REFERENCES master_data(id),
item_name_snapshot VARCHAR(150) NOT NULL,
unit_name VARCHAR(50) NOT NULL, -- Kg, Thùng, Gói
unit_price NUMERIC(12, 2) NOT NULL,
quantity NUMERIC(10, 2) NOT NULL,
total_cost NUMERIC(12, 2) NOT NULL, -- unit_price * quantity
payment_source VARCHAR(30) NOT NULL DEFAULT 'CASH_DRAWER', -- CASH_DRAWER (Tiền két), EXTERNAL (Chủ chuyển khoản
note TEXT,
created_by INT REFERENCES users(id),
import_date DATE NOT NULL DEFAULT CURRENT_DATE,
is_deleted BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE cash_drawer_settlements (
id SERIAL PRIMARY KEY,
settlement_date DATE NOT NULL,
shift_name VARCHAR(50) NOT NULL,
opening_budget NUMERIC(12, 2) NOT NULL, -- Ngân sách mặc định đầu ca do Admin cấu hình
total_cash_sales NUMERIC(12, 2) NOT NULL, -- Tổng thu TIỀN MẶT từ hóa đơn
total_transfer_sales NUMERIC(12, 2) NOT NULL, -- Tổng thu CHUYỂN KHOẢN QR (để đối soát ngân hàng)
total_cash_imports NUMERIC(12, 2) NOT NULL, -- Tổng CHI TIỀN MẶT từ két để nhập hàng
expected_cash_in_drawer NUMERIC(12, 2) NOT NULL, -- opening_budget + total_cash_sales - total_cash_imports
actual_counted_cash NUMERIC(12, 2) NOT NULL, -- Tiền thực đếm trong két khi kết ca
discrepancy_amount NUMERIC(12, 2) NOT NULL, -- actual_counted_cash - expected_cash_in_drawer
status VARCHAR(20) NOT NULL, -- MATCHED ( bằng 0), SURPLUS (lớn hơn 0), SHORTAGE (nhỏ hơn 0)
denominations_detail JSONB DEFAULT '{}', -- Chi tiết số tờ từng mệnh giá tiền
closed_by INT REFERENCES users(id),
closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## PHẦN 3: ĐẶC TẢ CHI TIẾT NGHIỆP VỤ & UX/UI TỪNG MODULE

## Module 0: Quản lý Thực đơn, Topping, Combo & Bàn QR (Module nền tảng bổ sung)

- Quản lý Món ăn & Khu vực chế biến:

- Mỗi món ăn khi tạo mới bắt buộc chọn 1 trong 3 khu vực: Bếp nấu (Mì cay, lẩu), Bếp chiên (Khoai tây chiên, phô mai que, cá viên), hoặc Quầy pha chế (Trà sữa, nước ngọt).

- Cấu hình nhóm tuỳ chọn đi kèm món ăn: Nhóm bắt buộc chọn 1 (Cấp độ cay từ 0 đến 7) và Nhóm chọn nhiều có tính thêm tiền (Topping thêm bò, thêm tôm, thêm phô mai).

- Hỗ trợ món dạng Combo: Khi khách chọn Combo, trên hóa đơn thanh toán hiển thị 1 dòng tên Combo chung, nhưng dưới cơ sở dữ liệu liên kết tới các món thành phần để khi bấm Tách đơn, hệ thống tự động tách đúng món về đúng bếp.

- Quản lý Bàn & Chống đơn ảo QR:

- Mỗi bàn có một mã QR chứa đường dẫn kèm mã bảo mật riêng.

- Khi khách quét mã QR và gửi đơn, nếu bàn đó chưa mở phiên phục vụ, đơn hàng sẽ vào màn hình thu ngân ở trạng thái Chờ xác nhận (nhấp nháy kèm chuông báo). Thu ngân xác nhận có khách ngồi thực tế mới bấm duyệt để bắt đầu tách bếp.

## Module 1: Trang Đặt đơn Thu ngân (Hoá đơn điện tử), Tách đơn & Thanh toán

## 1. Luồng xử lý Gọi thêm món (Add-on Order) và Tách đơn thông minh (Delta Split)

- Khi khách tại một bàn đang ăn quét mã QR lần thứ 2 để gọi thêm đồ chiên hoặc nước uống, hệ thống tự động gộp các món mới vào Hoá đơn điện tử đang mở của bàn đó và gán nhãn Mới gọi (Lượt 2) màu cam nổi bật.

ấ


- Khi thu ngân bấm nút Tách đơn:

- Hệ thống chỉ lọc các món có trạng thái Mới gọi (chưa từng in bếp) để chia thành 3 nhóm theo thuộc tính khu vực chế biến (BEP_NAU, BEP_CHIEN, PHA_CHE). Khu vực nào không có món trong lượt gọi đó sẽ không in phiếu.

- Tự động gửi lệnh in ra 3 phiếu rời nhau. Trên đầu mỗi phiếu in rõ: Logo khu vực (Mũ đầu bếp/Tô mì cho Bếp nấu; Khoai tây chiên cho Bếp chiên; Ly nước cho Quầy pha chế), Số bàn, Thời gian, Số lượt gọi (Đơn mới hoặc Gọi thêm) và danh sách món kèm cấp độ cay/ghi chú.

- Ngay sau khi in thành công, trạng thái các món đó tự động chuyển thành Đã tách bếp. Nếu mất giấy dưới bếp, thu ngân có thể bấm icon In lại phiếu bếp bên cạnh từng nhóm món.

## 2. Luồng Thanh toán chuẩn thực tế (Tách bạch Tạm tính QR và Đóng đơn)

Để khắc phục triệt để lỗi đóng đơn trước khi khách quét mã chuyển khoản, giao diện Hoá đơn điện tử tại quầy thu ngân được bố trí 3 nút thao tác theo đúng trình tự phục vụ:

| Nút thao tác | Trạng thái đơn sau khi | Hành vi hệ thống & Kết quả in ấn |
| --- | --- | --- |
|   | bấm |   |
| 1. Tách đơn | Đang phục vụ | Chia các món mới gọi về 3 khu vực bếp và in 3 phiếu chế biến có logo riêng |
| 2. In tạm tính | Đang phục vụ | In ngay hóa đơn tổng hợp kèm Mã VietQR động để mang ra bàn cho khách kiểm tra và quét |
| (QR) |   | chuyển khoản |
| 3. Thanh toán | Đã thanh toán | Mở Pop-up xác nhận phương thức thu tiền, chốt doanh thu vào dòng tiền ngày và giải phóng |
|   |   | bàn |

- Chi tiết Pop-up khi bấm nút "Thanh toán":

- Hiển thị thông báo xác nhận tránh bấm nhầm, cho phép chọn phương thức thanh toán: Tiền mặt, Chuyển khoản (mặc định nếu khách vừa quét QR), hoặc Hỗn hợp (khách trả một phần tiền mặt, một phần chuyển khoản).

- Gồm 2 nút: Hủy bỏ và Xác nhận.

- Khi bấm Xác nhận, hiển thị 2 tuỳ chọn hoàn tất: In hoá đơn (in biên lai chính thức kèm mã QR nếu khách chưa lấy phiếu tạm tính) và Không in (đóng đơn ngay lập tức để tiết kiệm giấy in khi khách đã cầm phiếu tạm tính trước đó).

## Module 2: Màn hình Quản lý & Tra cứu Hoá đơn

- Cấu trúc Base Table (7 cột):

- 1. STT

- 2. Mã hoá đơn

- 3. Bàn / Hình thức (Bàn 01, Mang về...)

- 4. Thời điểm tạo (Định dạng: Ngày/Tháng/Năm Giờ:Phút:Giây)

- 5. Tổng tiền & Phương thức (Hiển thị số tiền kèm nhãn Tiền mặt hoặc Chuyển khoản)

- 6. Ghi chú & Trạng thái (Hoàn thành / Đã huỷ)

- 7. Thao tác: Nút icon con mắt (Eye) để mở Modal xem chi tiết toàn bộ danh sách món ăn, cấp độ cay, lịch sử các lượt gọi món, kèm nút In lại hoá đơn và nút Huỷ hoá đơn (chỉ dành cho Admin/Quản lý, bắt buộc nhập lý do huỷ).

- Thiết kế Thanh tìm kiếm & Bộ lọc kép:

- Cụm chọn thời gian (Date Range Picker): Nằm cố định bên trái, mặc định chọn ngày Hôm nay giúp bảng tải tức thì. Cho phép chọn một ngày bất kỳ hoặc khoảng ngày.

- Cụm tìm kiếm từ khóa: Nằm kế bên, gồm Dropdown chọn tiêu chí (Mã hoá đơn, Số bàn, Ghi chú) kết hợp với ô Input nhập từ khoá. Hai cụm này hoạt động đồng thời giúp thu ngân vừa lọc theo ngày vừa gõ tìm bàn hoặc mã đơn dễ dàng.

## Module 3: Màn hình Nhập hàng & Đồng bộ Master Data

- Cấu trúc Base Table (8 cột):

- 1. STT

- 2. Ngày nhập

- 3. Tên món hàng

- 4. Đơn vị tính (Kg, Thùng, Gói, Két...)

- 5. Đơn giá

- 6. Số lượng

- 7. Thành tiền (Tự động tính bằng Đơn giá * Số lượng)

- 8. Nguồn tiền & Ghi chú (Hiển thị lấy từ Tiền két hay Quỹ ngoài)

ố

ể

ầ

ế


- 9. Thao tác: Icon thùng rác (Trash) ở cột cuối cùng để xoá dòng nhập nhầm (có Pop-up xác nhận; chỉ cho phép nhân viên xoá phiếu nhập trong ca hiện tại, các ngày cũ chỉ Admin mới được xoá mềm).

- Tách bạch Hành vi Tìm kiếm lịch sử và Thêm mới:

- Thanh tìm kiếm trên Base Table: Chỉ dùng để tra cứu lịch sử nhập hàng theo Ngày/Tháng/Năm (chọn lịch) và Tên món hàng (nhập từ khoá). Phía dưới bảng hiển thị tổng số tiền đã nhập theo bộ lọc hiện tại.

- Drawer "Thêm mới" (Mở từ bên phải):

- Cho phép thêm một hoặc nhiều dòng hàng cùng lúc vào bảng tạm trong Drawer trước khi bấm Lưu.

- Ô nhập Tên món hàng trong Drawer là một Smart Combobox kết nối trực tiếp với Master Data: Khi gõ từ khoá, hệ thống gợi ý các nguyên liệu đã có. Nếu chọn món đã có, hệ thống tự động điền sẵn Đơn vị tính và gợi ý Đơn giá của lần nhập gần nhất.

- Nếu tên món hàng chưa từng có trong hệ thống, khi nhân viên nhập xong và lưu phiếu, hệ thống tự động chuẩn hoá chuỗi và lưu tên món mới kèm đơn vị tính vào Master Data (Module 7) để tái sử dụng cho các ngày sau.

- Có nút chọn Nguồn tiền thanh toán: Lấy tiền mặt tại két thu ngân (mặc định) hoặc Chủ chuyển khoản / Quỹ ngoài.

## Module 4: Màn hình Ngân sách, Dòng tiền & Đối soát Kết ca

## 1. Thuật toán Đối soát Dòng tiền chuẩn xác

Để không bao giờ xảy ra tình trạng báo thiếu tiền ảo khi khách chuyển khoản QR hoặc khi thu ngân lấy tiền trong két đi mua đá, rau sống, hệ thống áp dụng công thức đối soát tách biệt:

```
1. Tổng doanh thu ngày = Doanh thu Tiền mặt + Doanh thu Chuyển khoản (QR)
2. Tiền mặt lý thuyết phải có trong két = Ngân sách mặc định đầu ca
+ Doanh thu Tiền mặt trong ca
- Tổng tiền mặt đã lấy từ két để Nhập hàng (Module 3)
3. Chênh lệch kết ca = Tiền mặt thực đếm trong két - Tiền mặt lý thuyết phải có trong két
```

- Phân loại Tình trạng sau khi bấm nút "Kết ca":

- Nếu Chênh lệch bằng 0: Hiển thị trạng thái Chuẩn (Nhãn màu Xanh lá).

- Nếu Chênh lệch lớn hơn 0: Hiển thị trạng thái Dư kèm số tiền dư cụ thể (Nhãn màu Vàng).

- Nếu Chênh lệch nhỏ hơn 0: Hiển thị trạng thái Thiếu kèm số tiền thiếu cụ thể (Nhãn màu Đỏ).

## 2. Thiết kế Giao diện & Component Kết ca

- Khu vực Cấu hình Ngân sách mặc định: Chỉ tài khoản có quyền Admin mới chỉnh sửa được mức tiền lẻ mặc định để đầu ngày (ví dụ: 1.000.000đ).

- Component Nhập tiền đếm trong két & Nút "Kết ca":

- Hỗ trợ 2 chế độ nhập: Nhập thẳng tổng số tiền đếm được, hoặc bấm mở Bảng đếm tiền theo mệnh giá (nhập số tờ 500k, 200k, 100k, 50k... hệ thống tự nhân và cộng tổng để chống nhầm lẫn).

- Sau khi bấm Kết ca, hệ thống hiển thị rõ bảng tóm tắt bàn giao:

- Số tiền giữ lại trong két cho ca sau (bằng đúng mức Ngân sách mặc định).

- Số tiền mặt thực tế cần rút ra khỏi két để nộp về cho Chủ quán.

- Base Table Lịch sử Dòng tiền: Hiển thị các cột: Ngày/Ca, Ngân sách đầu ca, Dòng tiền mặt (Thu - Chi), Doanh thu QR, Tiền thực đếm, Tình trạng (Chuẩn / Dư / Thiếu). Có thanh tìm kiếm lọc theo ngày/tháng.

## Module 5: Quản lý Nhân viên

- Base Table (7 cột): STT, Tên nhân viên (kèm tên viết tắt), Năm sinh, Chức vụ, Chuyên môn, Ghi chú, Thao tác (gồm 3 nút icon: Eye xem chi tiết, Pencil chỉnh sửa, Trash xoá nhân viên có Pop-up xác nhận theo cơ chế xoá mềm).

- Thanh tìm kiếm đa năng:

- Bên trái thanh tìm kiếm tích hợp bộ lọc Dropdown cho phép lọc theo Chức vụ hoặc Chuyên môn kết hợp với ô nhập từ khoá Tên nhân viên / Số điện thoại.

- Form Thêm mới / Chỉnh sửa nhân viên:

- Đầy đủ các trường: Tên nhân viên, Ngày tháng năm sinh, Nơi ở, Số CCCD, Nơi cấp, Số điện thoại, Ngày vào làm, Thông tin ngân hàng (Ngân hàng, Số tài khoản — đồng bộ với trang Hồ sơ cá nhân), Ghi chú, File đính kèm (upload ảnh CCCD, hợp đồng) và Ảnh đại diện.

- Hai trường Chức vụ và Chuyên môn lấy từ Master Data dạng Combobox: nếu chưa có trong danh sách thì cho phép gõ trực tiếp và tự động lưu bổ sung vào Master Data sau khi bấm Lưu.

## Module 6: Lịch làm việc (Giao diện dạng Bảng Excel)

- Cấu trúc Bảng Ma trận (7 cột x N dòng):

ầ

ầ

ế

ầ

ầ

ể ế


- Phía trên bảng có thanh chọn tuần (Tuần trước | Từ ngày - Đến ngày | Tuần sau) và nút Sao chép lịch tuần trước để tiết kiệm 80% thời gian xếp ca.

- 7 cột tương ứng từ Thứ Hai đến Chủ Nhật. Các dòng là các Khung giờ / Ca làm việc tuỳ chỉnh của cửa hàng.

- Mỗi ô trong bảng là một Multi-select Dropdown có tìm kiếm từ khoá, cho phép chọn nhiều nhân viên cùng trực trong một ca. Mỗi nhân viên được chọn hiển thị dưới dạng nhãn (Tag) gắn màu sắc theo Chuyên môn (ví dụ: Màu đỏ cho Bếp nấu, Màu vàng cho Bếp chiên, Màu xanh cho Pha chế) giúp quản lý nhìn lướt qua biết ngay ca đó đã đủ người cho 3 khu vực bếp hay chưa.

- Thuật toán Rút gọn tên & Chống trùng lặp tự động:

- Hệ thống tự động chuyển Nguyễn Văn Anh thành V.Anh.

- Nếu trong quán có 2 nhân viên trùng tên viết tắt (ví dụ Nguyễn Văn Anh và Trần Văn Anh), hệ thống tự động nối thêm chữ cái đầu của Họ và mã số: N.V.Anh (#01) và T.V.Anh (#02). Khi mở dropdown tìm kiếm sẽ hiển thị đầy đủ cả tên viết tắt lẫn họ tên đầy đủ và chuyên môn để chọn chính xác.

- Cơ chế Bảo vệ Dữ liệu chưa lưu (Unsaved Changes Guard):

- Cho phép chỉnh sửa trực tiếp trên các ô bảng nhưng chỉ ghi xuống cơ sở dữ liệu khi bấm nút Lưu.

- Nếu người dùng đã thay đổi bất kỳ ô nào mà chưa bấm Lưu nhưng lại bấm chuyển sang màn hình khác trên Sidebar, bấm nút Back, hoặc tắt tab trình duyệt, hệ thống lập tức chặn lại và bật Pop-up cảnh báo ("Bạn có thay đổi lịch làm việc chưa lưu. Bạn muốn Lưu lại hay Huỷ bỏ thay đổi?").

## Module 7: Quản lý Master Data (MDM)

- Phân chia Category: Giao diện chia theo các nhóm danh mục tương ứng với các trang sử dụng:

- 1. Nguyên liệu nhập hàng & Đơn vị tính (dùng cho Module 3).

- 2. Chức vụ nhân sự (dùng cho Module 5).

- 3. Chuyên môn / Khu vực làm việc (dùng cho Module 5 và Module 6).

- 4. Khung giờ / Ca làm việc (dùng cho Module 6).

- Cơ chế Chống rác dữ liệu (Data Normalization):

- Khi nhân viên thêm nhanh giá trị mới từ Module 3 hoặc Module 5, hệ thống tự động cắt khoảng trắng thừa ở hai đầu (trim()), chuẩn hoá chữ hoa đầu từ và đối chiếu chuỗi không dấu. Nếu phát hiện đã có "Mì cay" trong hệ thống thì khi nhân viên gõ "mì cay " hệ thống sẽ tự động map vào mục cũ thay vì tạo bản ghi trùng lặp.

## Module 8: Phân quyền Hệ thống (RBAC)

- Base Table Danh sách Tài khoản: Hiển thị các tài khoản trong hệ thống kèm nút Thêm mới tài khoản (chỉ Admin mới thấy và sử dụng được nút này; khi tạo tài khoản sẽ chọn liên kết với nhân viên tương ứng từ Module 5).

- Drawer Cấu hình Quyền hạn (Mở khi bấm icon Bánh răng Settings):

- Danh sách toàn bộ các màn hình trong hệ thống hiển thị dưới dạng Checkbox.

- Khi tích chọn Checkbox của một màn hình, tài khoản đó mới nhìn thấy màn hình trên Sidebar và được phép truy cập đường dẫn của trang đó (mặc định khi mới tích chọn chỉ có quyền View - Xem dữ liệu).

- Bên cạnh mỗi Checkbox màn hình đã tích là Dropdown cấu hình quyền CRUD chi tiết:

- Xem (Read): Chỉ xem bảng và chi tiết.

- Thêm (Create): Được bấm nút Thêm mới / Tạo đơn / Kết ca.

- Sửa (Update): Được chỉnh sửa dữ liệu, cấu hình ngân sách mặc định.

- Xoá (Delete): Được bấm icon thùng rác hoặc huỷ hoá đơn.

- Tài khoản Admin: Mặc định tích chọn toàn bộ quyền hạn và toàn bộ các ô Checkbox/Dropdown đều ở trạng thái Readonly (không ai có thể tự khoá quyền của Admin).

- Cơ chế Bảo vệ Đường dẫn (Route Guard & HTTP Status):

- Nếu một tài khoản cố tình gõ trực tiếp đường dẫn URL (ví dụ /nhan-vien hoặc /) của trang không được cấp quyền trên trình duyệt, hệ thống kiểm tra danh sách phân quyền và lập tức chặn truy cập, hiển thị màn hình cảnh báo Không đủ quyền hạn truy cập (lưu ý kỹ thuật: trả về mã chuẩn 403 Forbidden cho tài khoản đã đăng nhập nhưng thiếu quyền, và mã 401 Unauthorized khi chưa đăng nhập hoặc hết hạn phiên).

## Module 9: Thanh Navbar, Hồ sơ Tài khoản, Tìm kiếm Nhanh & Tuỳ biến Giao diện

- Bố cục góc phải Navbar (từ trái sang phải):

- 1. Thanh Search đại diện (Command Palette): Khi bấm vào (hoặc nhấn phím tắt Ctrl + K), một Pop-up hiện ra cho phép gõ tìm kiếm nhanh tên các màn hình (Category từ Sidebar) để chuyển trang tức thì. Danh sách màn hình hiện ra trong Pop-up này tự động lọc theo đúng quyền hạn mà tài khoản đó được cấp ở Module 8.

- 2. Nút chuyển đổi Theme Sáng / Tối (Light / Dark Mode): Khoảng cách tách biệt rõ ràng bên trái khu vực Avatar.

ố ề

ấ

ố ấ

ồ

ổ ố

ồ


- 3. Khu vực Avatar + Tên tài khoản (Nối liền thành 1 khối bấm được): Khi bấm vào sẽ xổ xuống Dropdown gồm 2 mục: Hồ sơ tài khoản và Đăng xuất.

- Trang Hồ sơ Tài khoản:

- Hiển thị thông tin đồng bộ trực tiếp từ hồ sơ nhân sự của tài khoản đó: Họ và tên, Ngày tháng năm sinh, Số điện thoại, Nơi ở, Số CCCD, Nơi cấp, Thông tin ngân hàng.

- Trường Chuyên môn và Chức vụ được ánh xạ tự động từ trang Quản lý nhân viên và khoá ở chế độ Readonly.

- Tính năng Ảnh đại diện (Avatar): Cho phép tải ảnh lên, tích hợp khung cắt và phóng to/thu nhỏ ảnh trực tiếp trên giao diện (Resize & Crop) trước khi lưu.

- Cơ chế Kéo giãn (Resize) & Xoá Bộ nhớ đệm thông minh khi Đăng xuất:

- Toàn bộ các cột trong mọi Base Table và cả thanh Sidebar bên trái đều hỗ trợ nắm kéo chuột để thay đổi độ rộng tuỳ ý.

- Khi bấm Đăng xuất: Hệ thống lập tức xoá sạch toàn bộ bộ nhớ đệm dữ liệu và phiên đăng nhập (Access Token, thông tin cá nhân, cache danh sách hoá đơn/dòng tiền trong bộ nhớ trình duyệt) để đảm bảo an toàn bảo mật tuyệt đối. Riêng cấu hình giao diện cá nhân (Độ rộng cột đã kéo, độ rộng Sidebar, chế độ Sáng/Tối) được lưu tách biệt theo mã tài khoản vào cơ sở dữ liệu (ui_preferences) để lần đăng nhập tiếp theo giao diện vẫn giữ nguyên bố cục quen thuộc của người đó.

## PHẦN 4: GIẢI PHÁP KỸ THUẬT CHO 2 BÀI TOÁN ĐẶC THÙ

## 4.1. Giải pháp In nhiệt tự động tách 3 phiếu bếp kèm Logo từ Web App

Để bấm nút Tách đơn mà máy in nhiệt khổ 80mm tự động in liên tiếp 3 phiếu rời nhau (Bếp nấu, Bếp chiên, Pha chế) kèm Logo từng bếp mà không bị kẹt ở cửa sổ xác nhận của trình duyệt:

- 1. Định dạng CSS @media print chia trang tự động cắt giấy: Render đồng thời các phiếu bếp có phát sinh món trong lượt gọi đó vào một khung ẩn chuyên dụng cho việc in, mỗi phiếu bếp bọc trong một khối có thuộc tính ngắt trang break-after: page; page-break- after: always;. Khi trình duyệt gửi lệnh in xuống driver máy in nhiệt 80mm (như Xprinter XP-80C/K80), mỗi lệnh ngắt trang sẽ kích hoạt dao cắt giấy vật lý tách rời từng phiếu.

- 2. Bật chế độ In ngầm (Silent Printing) trên máy tính thu ngân: Tạo shortcut trình duyệt Chrome/Edge chuyên dụng cho quầy thu ngân với tham số khởi chạy --kiosk-printing. Khi thu ngân bấm nút Tách đơn hoặc In hoá đơn, lệnh window.print() sẽ bắn thẳng xuống máy in mặc định trong 0,5 giây mà không bật bất kỳ hộp thoại xác nhận nào.

```
/* Cấu hình CSS chuẩn cho máy in nhiệt 80mm tự động giãn chiều cao và cắt giấy theo từng bếp */
@media print {
@page {
size: 80mm auto;
margin: 0;
}
body * {
visibility: hidden;
}
#kitchen-print-container, #kitchen-print-container * {
visibility: visible;
}
#kitchen-print-container {
position: absolute;
left: 0;
top: 0;
width: 72mm; /* Trừa lề an toàn cho khổ giấy 80mm */
}
.kitchen-ticket {
width: 100%;
padding: 2mm 0;
break-after: page;
page-break-after: always; /* Kích hoạt dao cắt giấy tự động giữa 3 bếp */
}
}
```

## 4.2. Giải pháp tạo Mã VietQR động trên phiếu thanh toán

Thay vì in một mã QR tĩnh bắt khách phải tự gõ số tiền (dễ gõ thiếu số 0 hoặc quên ghi mã bàn), hệ thống tự động sinh đường dẫn ảnh VietQR theo chuẩn Napas247 cho từng hoá đơn:

```
// Hàm tạo URL mã QR chuyển khoản tự động điền đúng số tiền và mã hoá đơn
export function generateVietQRUrl(params: {
bankBin: string; // Ví dụ: '970436' (Vietcombank) hoặc '970422' (MBBank)
accountNo: string; // Số tài khoản cửa hàng
accountName: string; // Tên chủ tài khoản
amount: number; // Tổng tiền hoá đơn
orderCode: string; // Mã hoá đơn: HD20261105001
}): string {
const description = encodeURIComponent(`TT ${params.orderCode}`);
const accName = encodeURIComponent(params.accountName);
return `https://img.vietqr.io/image/${params.bankBin}-${params.accountNo}-print.png?amount=${params.amount}&addInf
}
```


## PHẦN 5: LỘ TRÌNH TRIỂN KHAI ĐỀ XUẤT (4 GIAI ĐOẠN)

| Giai đoạn | Hạng mục xây dựng | Mục tiêu đầu ra |
| --- | --- | --- |
| Giai đoạn 1: | Database, Auth, Module 7 (MDM), Module 8 (RBAC), Module | Khung hệ thống chạy mượt, phân quyền chặt chẽ, kéo |
| Core & MDM | 9 (Navbar/Layout) | giãn cột/sidebar, Dark mode |
| Giai đoạn 2: POS | Module 0 (Menu/Bàn QR), Module 1 (Đặt món QR, Tách 3 | Thay thế hoàn toàn việc ghi giấy tay tại quán, vận hành |
| & Bếp | bếp, VietQR), Module 2 (Hoá đơn) | trơn tru luồng gọi món và in ấn |
| Giai đoạn 3: Kho | Module 3 (Nhập hàng tự lưu MDM), Module 4 (Ngân sách, | Kiểm soát chặt chẽ chi phí nguyên liệu và đối soát két |
| & Tiền | Đếm tiền & Kết ca) | tiền mặt chính xác cuối ngày |
| Giai đoạn 4: | Module 5 (Quản lý nhân viên), Module 6 (Lịch làm việc Excel- | Hoàn thiện quản lý hồ sơ nhân sự và xếp ca làm việc |
| Nhân sự | grid) | trực quan theo tuần |

User prompt: Một dự án để trước khi bắt đầu thì ngoài tài liệu giải pháp còn phải có thêm các dữ liệu gì nữa? Ví dụ như ERD? Sequence Diagram? Usecase? User Story?

Response: Để bắt tay vào code một hệ thống nhiều luồng nghiệp vụ liên kết chặt chẽ như POS Mì cay mà không bị đập đi xây lại (refactor) giữa chừng, ngoài Tài liệu Giải pháp (SRS/SAD), bạn cần chuẩn bị thêm 5 nhóm tài liệu và dữ liệu kỹ thuật cốt lõi.

Với tư cách là một lập trình viên Full-stack trực tiếp triển khai dự án, bạn không cần làm bộ tài liệu rườm rà kiểu hành chính, mà nên tập trung vào các bản thiết kế giải quyết trực tiếp bài toán Trạng thái dữ liệu, Luồng bất đồng bộ, Giao diện thao tác nhanh và Dữ liệu mồi (Seed Data).

## 1. Nhóm Mô hình hoá Dữ liệu & Trạng thái (Bắt buộc cho Backend)

## 1.1. Physical ERD (Sơ đồ Thực thể Liên kết Vật lý) & Đặc tả Index

Từ đoạn mã SQL trong tài liệu giải pháp, bạn cần vẽ ra một sơ đồ ERD trực quan (chuẩn ký hiệu Crow's Foot) để kiểm soát:

- Mối quan hệ và Khoá ngoại (Cardinality): Nhìn rõ đâu là quan hệ 1-1 (giữa employees và users), đâu là 1-N (giữa orders và order_items), và đâu là bảng trung gian N-N (như combo_items).

- Quy tắc toàn vẹn khi xoá (Referential Integrity): Xác định rõ bảng nào dùng ON DELETE CASCADE (xoá đơn nháp thì xoá luôn món trong đơn) và bảng nào bắt buộc dùng ON DELETE RESTRICT + Soft Delete (như employees, products, master_data — tuyệt đối không cho xoá vật lý nếu đã từng phát sinh hoá đơn hoặc phiếu nhập hàng).

- Chiến lược đánh Index (Indexing Strategy): Định nghĩa trước các cặp cột sẽ bị truy vấn liên tục ở thanh Search của Base Table. Ví dụ: Đánh Composite Index cho (created_at, status) ở bảng orders và (category, normalized_name) ở bảng master_data.

## 1.2. State Machine Diagram (Biểu đồ Chuyển đổi Trạng thái)

Đây là tài liệu quan trọng bậc nhất trong hệ thống POS nhưng lại hay bị lập trình viên bỏ quên nhất. Nếu không vẽ rõ các trạng thái và điều kiện chuyển trạng thái trước khi code, phần Backend của bạn sẽ rơi vào mê cung if/else và sinh ra lỗi (ví dụ: đơn đã thanh toán rồi nhưng khách quét QR vẫn chèn thêm món vào được). Bạn cần vẽ 2 biểu đồ trạng thái:

- Vòng đời của Hoá đơn (Order State Machine):

- PENDING (Khách vừa quét QR đặt món) → Thu ngân bấm Duyệt → SERVING (Đang ăn tại bàn, cho phép gọi thêm món và in tạm tính QR) → Thu ngân bấm Xác nhận thanh toán → PAID (Đóng đơn, cộng vào dòng tiền Kết ca).

- Nhánh rẽ ngoại lệ: Từ PENDING hoặc SERVING (hoặc PAID nếu là Admin) → Bấm Huỷ kèm lý do → VOIDED (Loại khỏi doanh thu).

- Vòng đời của Từng món gọi (OrderItem State Machine):

- NEW (Mới gọi ở lượt 1 hoặc gọi thêm ở lượt 2) → Thu ngân bấm nút Tách đơn → PRINTED (Đã in ra phiếu cho Bếp nấu / Bếp chiên / Pha chế). Nhờ ranh giới trạng thái này, lần bấm Tách đơn tiếp theo hệ thống sẽ bỏ qua toàn bộ các món đã ở trạng thái PRINTED.

## 2. Nhóm Mô hình hoá Hành vi & Luồng Tương tác

## 2.1. Use Case Diagram & Ma trận Phân quyền (RBAC Matrix)

Thay vì viết đặc tả Use Case văn bản dài dòng cho từng màn hình, bạn cần:

- 1 Sơ đồ Use Case tổng thể: Xác định ranh giới hệ thống với 4 tác nhân (Actors): Khách hàng tại bàn (QR Guest), Thu ngân (Cashier), Nhân viên kho/bếp (Staff) và Chủ quán (Admin).

- Bảng Ma trận Phân quyền (Permission Matrix): Liệt kê toàn bộ 9 Module theo chiều dọc và các quyền View, Create, Update, Delete cùng các quyền đặc biệt (Chỉnh ngân sách mặc định, Huỷ hoá đơn đã thu tiền) theo chiều ngang. Bảng này chính là dữ liệu đầu vào cho Drawer cấu hình quyền ở Module 8.

## 2.2. User Stories kèm Acceptance Criteria (Tiêu chí Nghiệm thu)

User Story giúp bạn giữ đúng góc nhìn người dùng, nhưng Acceptance Criteria (AC — viết theo cấu trúc Given / When / Then) mới là thứ giúp bạn liệt kê hết các tình huống biên (Edge Cases) để tự kiểm thử (Test):

ố ế

ế

ế


- Ví dụ User Story (Module 6 - Lịch làm việc): Là người quản lý, tôi muốn xếp ca làm việc trực tiếp trên bảng 7 ngày và được cảnh báo nếu quên bấm Lưu để không bị mất dữ liệu xếp lịch.

- Acceptance Criteria (AC) đi kèm:

- AC1: Khi chọn nhân viên vào ô Ca Tối Thứ Bảy, hệ thống chỉ hiển thị tên viết tắt (V.Anh), nếu trùng tên viết tắt giữa 2 người thì tự động hiển thị N.V.Anh (#12) và T.V.Anh (#15).

- AC2: Khi dữ liệu trên bảng có thay đổi (isDirty = true) mà chưa bấm nút Lưu, nếu người dùng bấm vào mục khác trên Sidebar hoặc bấm đóng tab trình duyệt, hệ thống phải chặn thao tác điều hướng và hiển thị Pop-up xác nhận.

## 2.3. Sequence Diagram (Biểu đồ Tuần tự) & Activity Flowchart

Bạn không cần vẽ Sequence Diagram cho các chức năng thêm/sửa/xoá đơn giản (như thêm nhân viên hay sửa Master Data), mà chỉ tập trung vẽ cho 3 luồng phức tạp có nhiều thành phần tham gia:

- 1. Sequence 1 (Realtime QR Order & Kitchen Split): Điện thoại khách quét QR gửi POST /api/orders → Backend lưu DB → Backend bắn sự kiện WebSocket order:incoming → Màn hình Thu ngân phát chuông báo & hiển thị đơn → Thu ngân bấm Tách đơn → Backend lọc món NEW, gom nhóm theo 3 khu vực (BEP_NAU, BEP_CHIEN, PHA_CHE), cập nhật trạng thái thành PRINTED và trả về mảng 3 phiếu in → Trình duyệt gọi lệnh in nhiệt tự động cắt giấy 3 phiếu.

- 2. Sequence 2 (Thanh toán & VietQR động): Thu ngân bấm In tạm tính → Hệ thống sinh URL VietQR chứa sẵn Tổng tiền và Mã hoá đơn → In ra giấy cho khách quét → Thu ngân bấm Thanh toán → Chọn Tiền mặt/Chuyển khoản → Chốt trạng thái PAID.

- 3. Sequence 3 (Luồng Kết ca & Đối soát Dòng tiền ở Module 4): Thu ngân nhập số tiền thực đếm trong két và bấm Kết ca → Backend chạy Transaction truy vấn tổng đơn PAID bằng CASH, truy vấn tổng phiếu nhập hàng ở Module 3 lấy từ CASH_DRAWER, cộng với Ngân sách mặc định đầu ca → Tính độ lệch (Discrepancy) → Ghi nhận kết quả Chuẩn / Dư / Thiếu.

## 3. Nhóm Hợp đồng Giao tiếp & Giao diện (API Spec & Wireframe)

## 3.1. API Specification (OpenAPI / Swagger & Socket Contract)

Trước khi code song song Frontend và Backend, bạn cần định nghĩa rõ cấu trúc JSON giao tiếp:

- RESTful Endpoints: Danh sách URL, Query Params cho các thanh tìm kiếm có Dropdown (ví dụ: GET /api/invoices? fromDate=2026-11-01&toDate=2026-11-05&searchField=order_code&keyword=HD001), cấu trúc Request Body và mã lỗi trả về (401 khi hết hạn đăng nhập, 403 khi cố tình truy cập link không có trong danh sách quyền của Module 8).

- WebSocket Events Payload: Quy định rõ tên sự kiện và cục dữ liệu bắn xuống máy thu ngân khi khách quét QR đặt món mới hoặc gọi thêm món.

## 3.2. Wireframe (Bản phác thảo màn hình) & Quy chuẩn UI (Design System)

Bạn chỉ cần vẽ nhanh trên Excalidraw hoặc Figma bố cục khung (Low-fidelity Wireframe) cho các màn hình đặc thù:

- Màn hình POS Thu ngân & Mẫu giấy in 80mm: Bố trí vị trí nút Tách đơn, In tạm tính, Thanh toán sao cho thu ngân thao tác thuận tay nhất; thiết kế bố cục tờ phiếu in bếp khổ 80mm (vị trí Logo Mũ đầu bếp / Khoai tây chiên / Ly nước, cỡ chữ tên món và cấp độ cay phải to rõ để bếp đứng cách 1 mét vẫn đọc được).

- Component Base Table & Drawer dùng chung: Quy định chuẩn vị trí thanh Search có Dropdown lọc bên trái, thanh kéo giãn cột (Column Resizer), và kích thước Drawer mở từ bên phải (ví dụ: rộng 480px hoặc 600px).

## 4. Nhóm Dữ liệu Mồi Thực tế (Master Seed Data)

Một dự án POS sẽ không thể chạy thử nghiệm sát thực tế nếu trong Database chỉ có dữ liệu giả kiểu "Test 1, Test 2". Trước hoặc trong khi code, bạn cần lập một file Excel hoặc JSON chứa Dữ liệu thật của quán (Seed Data) để viết script nạp tự động vào hệ thống:

- 1. Danh sách Thực đơn chuẩn của quán: Toàn bộ các món Mì cay (kèm nhóm cấp độ 0 đến 7), danh sách Topping cộng thêm tiền, các món Đồ chiên và các món Nước uống — tất cả được gán sẵn mã khu vực bếp (BEP_NAU, BEP_CHIEN, PHA_CHE).

- 2. Danh sách Bàn: Từ Bàn 01 đến bàn cuối cùng của quán kèm lựa chọn Mang về.

- 3. Danh mục Master Data ban đầu: Các Chức vụ (Quản lý, Thu ngân, Phục vụ, Đứng bếp), Chuyên môn (Bếp nấu, Bếp chiên, Pha chế, Đa năng), Đơn vị tính (Kg, Thùng, Gói, Két, Lốc) và khoảng 20–30 nguyên liệu nhập hàng thường xuyên nhất của quán (Mì Hàn Quốc, Bò Mỹ, Bạch tuộc, Kim chi, Phô mai que, Đá bi...).

- 4. Cấu hình Mặc định: Tài khoản Super Admin gốc, các Khung giờ ca làm việc (Ca Sáng, Ca Chiều, Ca Tối) và con số Ngân sách mặc định đầu ngày của két tiền.

## 5. Bảng tổng hợp Mức độ Ưu tiên & Công cụ Tạo nhanh

| Tài liệu / Dữ liệu | Mục đích cốt lõi trong dự án | Mức độ ưu | Công cụ khuyên dùng |
| --- | --- | --- | --- |
|   |   | tiên |   |
| Physical ERD | Chốt cấu trúc bảng, khoá ngoại và đánh Index tìm kiếm | Bắt buộc (P0) | dbdiagram.io, Mermaid.js |
| State Machine Diagram | Kiểm soát trạng thái Đơn hàng & Món tách bếp không bị lỗi | Bắt buộc (P0) | Mermaid.js, Excalidraw |
| Sequence Diagram | Làm rõ 3 luồng khó: Quét QR, Tách 3 bếp và Kết ca dòng tiền | Bắt buộc (P0) | Mermaid.js |


| Tài liệu / Dữ liệu | Mục đích cốt lõi trong dự án | Mức độ ưu | Công cụ khuyên dùng |
| --- | --- | --- | --- |
|   |   | tiên |   |
| Master Seed Data | Có ngay thực đơn thật, nguyên liệu thật và tài khoản Admin để | Bắt buộc (P0) | File JSON / TypeScript |
|   | test |   | Seed |
| Wireframe & Mẫu in 80mm | Định hình giao diện Base Table, Drawer, Lịch Excel và mẫu bill | Rất nên có | Excalidraw, Figma |
|   |   | (P1) |   |
| API & Socket Contract | Thống nhất dữ liệu truyền nhận giữa Frontend và Backend | Rất nên có | Swagger / OpenAPI |
|   |   | (P1) |   |
| User Story & AC (Edge | Làm checklist nghiệm thu các ràng buộc UX (như cảnh báo | Nên có (P2) | Notion, Markdown |
| cases) | chưa Lưu) |   |   |
| Use Case & RBAC Matrix | Tổng quan phân quyền các màn hình cho từng nhóm nhân sự | Nên có (P2) | Bảng Markdown / |
|   |   |   | Mermaid |

Sơ đồ tương tác dưới đây mô hình hoá trực tiếp 4 bản thiết kế kỹ thuật cốt lõi nhất của dự án POS Mì cay (Biểu đồ trạng thái đơn & tách bếp, Luồng tuần tự đặt món QR tới máy in 3 bếp, Sơ đồ thực thể ERD rút gọn và Luồng thuật toán Kết ca) để bạn kiểm tra trực quan cách chúng vận hành cùng nhau:

Khi đã có Tài liệu Giải pháp ở bước trước cộng thêm bộ ERD + State Machine + Sequence Diagram + Master Seed Data này, bạn đã nắm trong tay 100% bản đồ kỹ thuật rõ ràng để bắt tay vào dựng khung dự án mà không sợ sót bất kỳ ngóc ngách nghiệp vụ nào.

User prompt: Còn một trường hợp chưa cover đó chính là khách đến đặt đồ mang về hoặc những khách đã thuộc menu và gọi trực tiếp thì trên màn hình thu ngân hay nhân viên vẫn phải có một module / view để có thể tự order đồ ăn và module này sẽ cho phép chọn số bàn nữa. Và thêm trường hợp nếu order như vậy lỡ nhân viên bấm nhầm số bàn thì cho phép chỉnh sửa lại các thứ. Nhắc tới đó thì lại thêm một GAP là khách đã order quét QR bàn 1 nhưng sau lại muốn chuyển bàn 7 thì sao? Lại thêm một tính năng chuyển bàn thực hiện tay hả?

Response: Ba tình huống bạn vừa phát hiện chính là những bài toán thực chiến sống còn tại quầy thu ngân FnB. Nếu hệ thống chỉ thiết kế luồng một chiều "Khách quét QR tại bàn Thu ngân nhận đơn", phần mềm sẽ lập tức bị "đứng hình" khi gặp khách đứng tại quầy gọi đồ mang về, khách quen đọc món trực tiếp cho thu ngân bấm máy, hoặc khách đang ngồi Bàn 1 thấy nóng quá nên tự xách tô mì sang Bàn 7 ngồi.

Dưới đây là phân tích chuyên sâu các lỗ hổng dây chuyền (Domino GAPs) phát sinh từ 3 tình huống này cùng thiết kế UX và giải pháp kỹ thuật tương thích 100% với kiến trúc hệ thống hiện tại của bạn.

## 1. Phân tích Chuyên sâu 3 Lỗ hổng Dây chuyền (Domino GAPs)

## GAP A: Bẫy "Gộp nhầm đơn" khi khách mua Mang về (Takeaway) hoặc Gọi trực tiếp tại quầy

- Vấn đề thực tế: Khi khách đến quầy đọc món mua mang về (hoặc khách lớn tuổi không muốn quét QR mà nhìn menu ở quầy rồi đọc cho thu ngân), thu ngân phải tự bấm chọn món trên máy tính.

- Lỗ hổng nếu chỉ tạo 1 bàn tên là "Mang về":

- Ở thiết kế trước, để chống trùng đơn khi khách gọi thêm món, hệ thống có quy tắc: "Hễ cùng 1 bàn đang có đơn mở (SERVING) thì tự động gộp món mới vào đơn đó".

- Nếu bạn tạo một bàn cố định trong Database tên là Bàn Mang Về: Lúc 19h00, khách A đến mua 2 tô mì cay mang về (đơn đang chờ bếp nấu, chưa đóng). Lúc 19h02, khách B bước vào mua 1 phần khoai tây chiên và 2 ly trà đào mang về. Nếu thu ngân lại chọn Bàn Mang Về, hệ thống sẽ gộp luôn khoai tây và trà đào của khách B vào chung hoá đơn với 2 tô mì của khách A!

- Cách xử lý chuẩn: Đơn Mang về (TAKEAWAY) không được gắn cố định vào 1 bàn duy nhất mà phải tự động sinh Thẻ số thứ tự độc lập cho từng khách (ví dụ: Mang về #01, Mang về #02, Mang về #03...) để 10 khách đứng chờ lấy đồ mang về cùng lúc vẫn có 10 hoá đơn điện tử tách biệt hoàn toàn.

## GAP B: Nhân viên tự bấm Order nhưng chọn nhầm bàn hoặc chọn nhầm món/cấp độ cay

- Vấn đề thực tế: Giờ cao điểm khách đứng đông trước quầy, khách bảo "Cho anh đặt bàn số 8", nhưng thu ngân nghe nhầm hoặc trượt chuột bấm vào Bàn 06, hoặc bấm nhầm Mì kim chi bò Cấp 1 thành Cấp 5.

- Lỗ hổng phân ranh giới chỉnh sửa:

- Trước khi bấm "Tách đơn" (Món chưa in xuống bếp): Nhân viên cần sửa lại số bàn, tăng/giảm số lượng, đổi cấp độ cay hoặc xoá món chỉ bằng 1 cú nhấp chuột mà không để lại rác dữ liệu.

- Sau khi đã bấm "Tách đơn" (Giấy đã in ra ở 3 bếp): Nếu nhân viên phát hiện mình bấm nhầm Cấp 1 thành Cấp 5 và lặng lẽ sửa lại trên màn hình máy tính thành Cấp 1 mà hệ thống không cảnh báo gì dưới bếp, Bếp nấu vẫn nhìn tờ giấy cũ và nấu tô mì Cấp 5 siêu cay mang ra cho khách!

## GAP C: Khách đã quét QR ở Bàn 1 nhưng chuyển sang Bàn 7 (Sát thủ vận hành thực tế)

Khi khách ngồi ở Bàn 1, đã quét QR đặt món, sau đó đứng dậy chuyển sang Bàn 7, có 3 hiệu ứng dây chuyền cực kỳ nguy hiểm xảy ra cùng lúc nếu bạn chỉ làm một nút đổi số bàn đơn giản trong Database:

- 1. Hiệu ứng 1 — Nhân viên bưng bê giao nhầm bàn (Nếu đơn đã bấm "Tách đơn"):


- Lúc khách còn ở Bàn 1, thu ngân đã bấm Tách đơn. Tờ phiếu in ở Bếp nấu, Bếp chiên và Quầy nước đều đang in chữ to đậm: BÀN 01.

- 2 phút sau khách chuyển sang Bàn 7, thu ngân đổi trên máy tính từ Bàn 1 sang Bàn 7. Nhưng 3 tờ giấy nằm dưới 3 khu vực bếp vẫn ghi BÀN 01! Khi nấu xong, nhân viên bưng đồ ra Bàn 1 thì không thấy khách đâu, hoặc tệ hơn là Bàn 1 vừa có một nhóm khách mới vào ngồi nên nhân viên bưng nhầm đồ ăn của Bàn 7 cho khách mới ở Bàn 1!

- 2. Hiệu ứng 2 — Bàn 7 không trống mà đang có bạn của khách ngồi ăn (Bài toán Gộp bàn - Merge Table):

- Thực tế tại quán mì cay: Khách ngồi Bàn 1 đợi bạn, lát sau nhóm bạn vào thấy Bàn 1 nhỏ quá nên cả nhóm dọn sang Bàn 7 (hoặc nhập hội vào Bàn 7 đang có người ngồi ăn trước đó).

- Lúc này hành động thực tế không chỉ là Chuyển sang bàn trống (Move), mà còn có trường hợp Gộp chung 2 bàn thành 1 hoá đơn (Merge) hoặc Hoán đổi vị trí 2 bàn (Swap).

- 3. Hiệu ứng 3 — Điện thoại của khách vẫn đang mở tab QR của Bàn 1:

- Khách quét mã QR lúc ngồi ở Bàn 1, nên trình duyệt Safari/Chrome trên điện thoại của khách vẫn đang lưu đường dẫn ?table=01.

- Sau khi khách đã chuyển sang ngồi ở Bàn 7 được 15 phút, khách mở sáng màn hình điện thoại lên (vẫn ở tab cũ) và bấm đặt thêm "2 Xúc xích chiên". Ngay lập tức, hệ thống lại tạo ra một đơn hàng mới tinh cho Bàn 1 (trong khi khách đang ngồi ở Bàn 7)!

## 2. Thiết kế UX/UI Thực tế: Nâng cấp Module 1 thành "Màn hình POS Hợp nhất"

Để thu ngân vừa nhận đơn QR tự động, vừa tự bấm order cho khách tại quầy/mang về, vừa đổi bàn và sửa món trên cùng một màn hình mà không phải chuyển trang qua lại, Module 1 (Trang đặt đơn thu ngân) cần được tổ chức theo bố cục Chia đôi màn hình (Split-View POS):

## 2.1. Nửa bên trái màn hình: Chuyển đổi linh hoạt giữa [Sơ đồ Bàn / Đơn] và [Thực đơn chọn món]

- Chế độ 1 — Lưới Bàn & Đơn Mang về (Mặc định):

- Phía trên có nút lớn nổi bật: [+ TẠO ĐƠN MANG VỀ] (Bấm vào tự động sinh đơn Mang về #01, #02... và mở ngay thực đơn để chọn món).

- Bên dưới là lưới các ô vuông đại diện cho Bàn 01 đến Bàn N với màu sắc trực quan:

- Màu Xám (Bàn trống): Khi khách đến quầy gọi món trực tiếp và chọn ngồi Bàn 5, thu ngân chỉ cần bấm vào ô Bàn 05 Khung bên trái lập tức lật sang Thực đơn món ăn để thu ngân bấm chọn món cho Bàn 5.

- Màu Cam nhấp nháy (Có đơn QR mới gửi vào): Thu ngân bấm vào để kiểm tra và bấm Tách đơn.

- Màu Xanh dương (Đang phục vụ): Hiển thị tổng tiền tạm tính và thời gian khách đã ngồi.

- Chế độ 2 — Thực đơn Gọi món nhanh tại máy (POS Menu Grid):

- Chia thành 3 Tab rõ ràng: Mì cay (Bếp nấu) | Đồ chiên (Bếp chiên) | Nước uống (Pha chế) kèm ô tìm kiếm nhanh theo tên tắt.

- Khi thu ngân bấm vào món "Mì kim chi bò", một Pop-up nhỏ bật lên ngay tại chỗ để chọn Cấp độ cay (0–7) và Topping thêm, bấm xác nhận là món nhảy thẳng sang Hoá đơn điện tử ở nửa bên phải màn hình.

## 2.2. Nửa bên phải màn hình: Hoá đơn Điện tử & Bộ công cụ Chỉnh sửa / Chuyển bàn

Ngay trên phần đầu (Header) của Hoá đơn điện tử đang mở, thiết kế cụm điều khiển cho phép sửa sai chỉ trong 2 giây:

- Nút [Bàn 01 ⇄ Đổi / Gộp bàn] (Hoặc [Mang về #01 ⇄ Đổi sang Bàn]):

- Dùng cho cả 2 trường hợp: Nhân viên lúc tạo đơn chọn nhầm số bàn hoặc Khách đang ngồi xin chuyển sang bàn khác (kể cả khách ban đầu định ngồi ăn tại bàn nhưng đổi ý xin gói mang về, hoặc ngược lại!).

- Chỉnh sửa món trong danh sách Hoá đơn điện tử (Phân theo trạng thái món):

- Với các món có trạng thái Mới gọi (Chưa bấm Tách đơn): Cho phép bấm nút + / - tăng giảm số lượng, bấm vào dòng món để đổi lại Cấp độ cay/Ghi chú, hoặc bấm icon thùng rác để xoá thẳng khỏi đơn.

- Với các món có trạng thái Đã tách bếp (Đã in phiếu xuống bếp): Nếu khách đổi ý xin đổi cấp độ cay hoặc huỷ món (khi bếp chưa kịp nấu), thu ngân bấm vào nút [Sửa / Huỷ món bếp] trên dòng đó. Hệ thống sẽ cập nhật lại hoá đơn và tự động in ra 1 tờ phiếu báo điều chỉnh nhỏ (⚠️ BÁO BẾP: BÀN 01 - ĐỔI MÌ BÒ CẤP 5 THÀNH CẤP 1 hoặc ⚠️ HUỶ MÓN) để đưa xuống bếp kịp thời.

## 3. Giải pháp Kỹ thuật & Luồng xử lý "Chuyển bàn / Gộp bàn" (Bàn 1 sang Bàn 7)

Khi thu ngân bấm vào nút [Bàn 01 ⇄ Đổi / Gộp bàn] trên Hoá đơn điện tử và chọn đích đến là Bàn 07, hệ thống sẽ tự động kiểm tra trạng thái thực tế của Bàn 01 và Bàn 07 để xử lý cả 3 lỗ hổng dây chuyền:

## Bước 1: Kiểm tra trạng thái Bàn đích (Bàn 07)

- Trường hợp 1 — Bàn 07 đang Trống (AVAILABLE):

- Hệ thống thực hiện lệnh Chuyển bàn (Move Table): Cập nhật table_id của Hoá đơn từ Bàn 01 sang Bàn 07. Đổi trạng thái Bàn 01 về Trống và Bàn 07 thành Đang phục vụ.

- Trường hợp 2 — Bàn 07 đang Có khách ngồi (OCCUPIED):

ố


- Hệ thống bật Pop-up hỏi thu ngân 2 lựa chọn rõ ràng:

- 1. Gộp chung hoá đơn vào Bàn 07 (Merge): Toàn bộ các món ăn của Bàn 01 được chuyển sang nối vào Hoá đơn đang mở của Bàn 07 (vẫn giữ nguyên trạng thái PRINTED của các món đã tách bếp trước đó để không bị in nấu lại!). Cộng dồn tổng tiền vào Bàn 07, đóng hoá đơn rỗng của Bàn 01 và trả Bàn 01 về trạng thái Trống.

- 2. Hoán đổi vị trí 2 bàn (Swap): Đổi chéo hoá đơn của Bàn 01 và Bàn 07 cho nhau.

## Bước 2: Tự động xử lý "Phiếu báo Chuyển bàn" cho Bếp (Giải quyết lỗ hổng giao nhầm bàn)

- Khi lệnh chuyển từ Bàn 01 sang Bàn 07 được thực thi, Backend kiểm tra trong hoá đơn đó:

- Nếu chưa có món nào tách bếp (kitchen_status = NEW toàn bộ): Đây là trường hợp nhân viên vừa bấm nhầm số bàn hoặc khách vừa quét QR xong đã đổi bàn ngay trước khi thu ngân bấm Tách đơn. Hệ thống chỉ đổi số bàn êm thấm trên máy, đến lúc bấm Tách đơn thì phiếu in ra đã mang tên BÀN 07 chuẩn xác 100%.

- Nếu đã có món tách bếp (kitchen_status = PRINTED): Hệ thống hiển thị tuỳ chọn (mặc định tích sẵn) [In phiếu báo chuyển bàn]. Máy in sẽ in ngay 1 phiếu ngắn kèm ghi chú vết đổi bàn trên đầu các phiếu gọi thêm sau đó:

THÔNG BÁO ĐỔI BÀN Đơn BÀN 01 (Mã: HD-005) đã chuyển sang BÀN 07 (Các món đang chế biến của Bàn 01 vui lòng giao qua Bàn 07)

## Bước 3: Chặn lỗi đặt nhầm từ Tab điện thoại cũ của khách (Session Redirect)

- Thay vì để trang web trên điện thoại của khách gửi cứng tham số table_id = 1 khi bấm "Gọi thêm món", ngay từ lần đặt món đầu tiên ở Bàn 1, Backend trả về cho trình duyệt điện thoại của khách mã định danh phiên đơn hàng (active_order_id).

- Khi khách chuyển từ Bàn 1 sang Bàn 7, nếu khách mở lại điện thoại (vẫn đang ở tab cũ) để gọi thêm nước:

- Backend nhận thấy active_order_id đó hiện đã được chuyển sang table_id = 7, liền tự động cập nhật giao diện trên điện thoại khách thành "Bạn đang gọi thêm món cho Bàn 07" và đẩy món mới vào đúng hoá đơn của Bàn 07!

- Còn nếu một vị khách mới tinh bước vào quán ngồi vào Bàn 1 vừa trống và quét mã QR trên mặt Bàn 1, hệ thống thấy đây là thiết bị mới (không mang active_order_id cũ) nên sẽ tạo một hoá đơn mới hoàn toàn cho Bàn 1.

## 4. Cập nhật bổ sung vào Database Schema (Bảng orders)

Bạn chỉ cần bổ sung thêm 3 trường dữ liệu vào bảng orders trong thiết kế Database trước đó để hỗ trợ trọn vẹn đơn Mang về, đơn bấm trực tiếp tại quầy và lịch sử Chuyển/Gộp bàn:

```
ALTER TABLE orders
ADD COLUMN order_type VARCHAR(20) NOT NULL DEFAULT 'DINE_IN',
-- Giá trị: 'DINE_IN' (Ăn tại bàn), 'TAKEAWAY' (Mua mang về)
ADD COLUMN order_source VARCHAR(20) NOT NULL DEFAULT 'QR_CODE',
-- Giá trị: 'QR_CODE' (Khách tự quét QR), 'POS_COUNTER' (Thu ngân/Nhân viên bấm máy)
ADD COLUMN takeaway_number INT,
-- Số thứ tự thẻ Mang về trong ngày (Ví dụ: 1, 2, 3... tự reset về 1 mỗi ngày mới)
ADD COLUMN table_transfer_logs JSONB DEFAULT '[]';
-- Lưu lịch sử đổi/gộp bàn: [{"from_table": "Bàn 01", "to_table": "Bàn 07", "time": "19:15:00", "by_user": "Thu ngân
```

## 5. Đánh giá mức độ Tương thích với Hệ thống & UX

| Tính năng bổ sung | Tương thích Hệ thống | Trải nghiệm Người dùng (UX) thực tế |
| --- | --- | --- |
| Gọi món trực tiếp tại máy (POS | 10/10: Dùng chung API tạo đơn và thuật | 10/10: Thu ngân vừa nhận đơn QR vừa bấm đơn cho |
| Menu Grid) | toán Tách 3 bếp với luồng QR | khách tại quầy trên 1 màn hình duy nhất |
| Đơn Mang về theo Số thứ tự | 10/10: Không làm bẩn bảng | 10/10: Phục vụ cùng lúc hàng chục khách chờ mua mang |
| động (MV #01) | dining_tables, tự động reset số mỗi | về mà không bao giờ bị gộp nhầm bill |
|   | ngày |   |
| Sửa bàn / Đổi bàn / Gộp bàn (Bàn | 10/10: Giữ nguyên order_id và trạng thái | 10/10: Xử lý mượt cả lỗi nhân viên bấm nhầm bàn lẫn |
| 1 Bàn 7) | PRINTED của từng món | khách đổi bàn giữa chừng, có phiếu báo bếp chống bưng |
|   |   | nhầm |
| Tự động điều hướng phiên QR | 9.5/10: Chỉ cần lưu order_id vào | 10/10: Khách đổi sang Bàn 7 mở lại điện thoại bấm gọi |
| (active_order_id) | sessionStorage trên điện thoại khách | thêm món vẫn vào đúng bill Bàn 7 |

Sơ đồ tương tác dưới đây mô phỏng trực quan Luồng vận hành POS Hợp nhất (Quét QR + Bấm máy tại quầy + Đơn Mang về) và Thuật toán Xử lý Chuyển bàn / Gộp bàn (Bàn 1 sang Bàn 7) theo từng tình huống trước và sau khi tách bếp:

Việc bổ sung Màn hình Gọi món trực tiếp tại máy (POS Menu Grid) cùng bộ xử lý Đơn Mang về độc lập (MV-#) và Chuyển / Gộp bàn có in phiếu báo bếp đã giúp hệ thống của bạn bao phủ kín 100% mọi tình huống thực tế có thể xảy ra tại quán mì cay.

ấ

ế ế

ầ


User prompt: Hãy xuất bản thiết kế ERD, State Machine và danh sách REST API + WebSocket Events đã cập nhật đầy đủ tính năng POS tại quầy, Đơn Mang về và Chuyển/Gộp bàn.

Response: Bản đặc tả kỹ thuật dưới đây cập nhật đầy đủ Sơ đồ Thực thể Liên kết (ERD), Biểu đồ Chuyển đổi Trạng thái (State Machine) và Hợp đồng Giao tiếp API + WebSocket đã tích hợp trọn vẹn luồng Gọi món trực tiếp tại quầy (POS Counter), Đơn Mang về (MV-#) và nghiệp vụ Chuyển bàn / Gộp bàn / Hoán đổi bàn.

## PHẦN 1: SƠ ĐỒ THỰC THỂ LIÊN KẾT VẬT LÝ (PHYSICAL ERD)

## 1.1. Sơ đồ ERD (Chuẩn cú pháp Mermaid)

Bạn có thể sao chép khối mã dưới đây vào Mermaid Live Editor hoặc tài liệu Markdown của dự án để hiển thị sơ đồ trực quan:

```
erDiagram
MASTER_DATA ||--o{ EMPLOYEES : "position_id / specialty_id"
MASTER_DATA ||--o{ INVENTORY_IMPORTS : "ingredient_mdm_id"
EMPLOYEES ||--o| USERS : "1-1 account link"
EMPLOYEES ||--o{ WORK_SCHEDULES : "assigned to"
SHIFT_DEFINITIONS ||--o{ WORK_SCHEDULES : "defines slot"
DINING_TABLES ||--o{ ORDERS : "hosts (Nullable for Takeaway)"
USERS ||--o{ ORDERS : "cashier_id"
ORDERS ||--|{ ORDER_ITEMS : "contains"
PRODUCTS ||--o{ ORDER_ITEMS : "ordered as"
PRODUCTS ||--o{ COMBO_ITEMS : "parent / child"
PRODUCTS }o--o{ MODIFIER_GROUPS : "has options"
MODIFIER_GROUPS ||--|{ MODIFIERS : "includes"
USERS ||--o{ INVENTORY_IMPORTS : "created_by"
USERS ||--o{ CASH_DRAWER_SETTLEMENTS : "closed_by"
MASTER_DATA {
int id PK
varchar category "POSITION, SPECIALTY, INGREDIENT, UNIT"
varchar name
varchar normalized_name UK
jsonb metadata "default_unit, last_price"
boolean is_active
}
EMPLOYEES {
int id PK
varchar full_name
varchar short_name "V.Anh, N.V.Anh (#12)"
date dob
varchar phone
varchar citizen_id UK
int position_id FK
int specialty_id FK
varchar bank_name
varchar bank_account_no
boolean is_deleted
}
USERS {
int id PK
int employee_id FK "Unique 1-1"
varchar username UK
text password_hash
boolean is_super_admin
jsonb permissions "CRUD + Sub-permissions"
jsonb ui_preferences "theme, column_widths, sidebar"
boolean is_active
}
DINING_TABLES {
int id PK
varchar name "Ban 01..Ban 30"
varchar qr_token UK
varchar status "AVAILABLE, PENDING, OCCUPIED"
int active_order_id "Pointer to current open order"
}
PRODUCTS {
int id PK
varchar name
numeric price
varchar station "BEP_NAU, BEP_CHIEN, PHA_CHE, COMBO"
boolean is_available
```


```
}
ORDERS {
int id PK
varchar order_code UK "HD-20261107-0001"
varchar order_type "DINE_IN, TAKEAWAY"
varchar order_source "QR_CODE, POS_COUNTER"
int table_id FK "NULL if TAKEAWAY"
int takeaway_number "1, 2, 3... reset daily"
varchar status "PENDING, SERVING, PAID, MERGED, VOIDED"
varchar payment_method "CASH, TRANSFER, SPLIT"
numeric cash_amount
numeric transfer_amount
numeric total_amount
int merged_into_order_id FK "Self-ref when merged"
jsonb table_transfer_logs "Move/Merge/Swap history"
int cashier_id FK
timestamp created_at
timestamp paid_at
}
ORDER_ITEMS {
int id PK
int order_id FK
int product_id FK
int quantity
numeric unit_price
jsonb modifiers_snapshot "Spicy level, toppings"
text item_note
int batch_no "Luot goi 1, 2, 3"
varchar kitchen_status "NEW, PRINTED, CANCELLED"
}
INVENTORY_IMPORTS {
int id PK
int ingredient_mdm_id FK
varchar unit_name
numeric unit_price
numeric quantity
numeric total_cost
varchar payment_source "CASH_DRAWER, EXTERNAL"
date import_date
boolean is_deleted
}
CASH_DRAWER_SETTLEMENTS {
int id PK
date settlement_date
varchar shift_name
numeric opening_budget
numeric total_cash_sales
numeric total_transfer_sales
numeric total_cash_imports
numeric expected_cash_in_drawer
numeric actual_counted_cash
numeric discrepancy_amount
varchar status "MATCHED, SURPLUS, SHORTAGE"
}
```

## 1.2. Các Ràng buộc Vật lý & Index Quan trọng (Database Constraints & Indexes)

Để chặn triệt để lỗi gộp nhầm đơn Mang về hoặc 1 bàn có 2 hoá đơn mở cùng lúc ở tầng Database, cần khởi tạo thêm 3 ràng buộc SQL sau:

```
-- 1. Ràng buộc phân tách Đơn tại bàn và Đơn mang về
ALTER TABLE orders ADD CONSTRAINT chk_order_type_target CHECK (
(order_type = 'DINE_IN' AND table_id IS NOT NULL AND takeaway_number IS NULL) OR
(order_type = 'TAKEAWAY' AND table_id IS NULL AND takeaway_number IS NOT NULL)
);
-- 2. Partial Unique Index: Đảm bảo 1 bàn vật lý chỉ có tối đa 1 đơn đang mở (PENDING hoặc SERVING) tại 1 thời điểm
CREATE UNIQUE INDEX idx_one_active_order_per_table
ON orders (table_id)
WHERE status IN ('PENDING', 'SERVING') AND table_id IS NOT NULL;
-- 3. Composite Index tối ưu tốc độ lọc cho các Base Table (Hoá đơn, Nhập hàng, Dòng tiền)
CREATE INDEX idx_orders_created_status ON orders (created_at DESC, status, payment_method);
CREATE INDEX idx_imports_date_mdm ON inventory_imports (import_date DESC, ingredient_mdm_id) WHERE is_deleted = FALS
```

## PHẦN 2: BIỂU ĐỒ CHUYỂN ĐỔI TRẠNG THÁI (STATE MACHINE DIAGRAMS)


## 2.1. Vòng đời của Hoá đơn (Order Lifecycle State Machine)

Điểm khác biệt cốt lõi trong biểu đồ này là 2 điểm khởi đầu khác nhau:

- Đơn do Khách quét QR (QR_CODE) bắt đầu ở trạng thái PENDING (chờ thu ngân duyệt để chống đơn ảo).

- Đơn do Thu ngân tự bấm tại máy (POS_COUNTER — cả Ăn tại bàn lẫn Mang về) nhảy thẳng vào trạng thái SERVING vì chính thu ngân là người thao tác.

- Bổ sung trạng thái kết thúc MERGED dành cho hoá đơn của bàn cũ sau khi đã dồn toàn bộ món sang bàn mới.

```
stateDiagram-v2
[*] --> PENDING : Khách quét QR đặt món (DINE_IN + QR_CODE)
[*] --> SERVING : Thu ngân tạo đơn tại máy (Bàn hoặc Mang về MV-#)
PENDING --> SERVING : Thu ngân bấm Duyệt & Tách đơn
PENDING --> VOIDED : Thu ngân từ chối (Đơn ảo / Khách đặt nhầm)
state SERVING {
[*] --> ActiveOrder
ActiveOrder --> ActiveOrder : Khách/Thu ngân gọi thêm món (batch_no + 1)
ActiveOrder --> ActiveOrder : Bấm Tách đơn (Chỉ in món NEW -> PRINTED)
ActiveOrder --> ActiveOrder : Bấm In tạm tính (Sinh mã VietQR động)
ActiveOrder --> ActiveOrder : Chuyển bàn trống (Move: Bàn 1 -> Bàn 7)
ActiveOrder --> ActiveOrder : Hoán đổi 2 bàn (Swap: Bàn 1 <-> Bàn 7)
}
SERVING --> MERGED : Gộp vào bàn khác đang ăn (Chuyển hết items sang đơn đích)
SERVING --> PAID : Thu ngân bấm Thanh toán -> Xác nhận (Tiền mặt / QR)
SERVING --> VOIDED : Admin/Quản lý huỷ đơn (Nhập lý do huỷ)
PAID --> VOIDED : Admin huỷ hoá đơn đã thu tiền (Trừ ngược doanh thu ca)
MERGED --> [*]
PAID --> [*]
VOIDED --> [*]
```

## 2.2. Vòng đời của Từng dòng món ăn (OrderItem Kitchen State Machine)

Quản lý trạng thái từng món ăn là chìa khoá để xử lý tình huống Nhân viên bấm nhầm món/cấp độ cay trước và sau khi bấm nút Tách đơn:

```
stateDiagram-v2
[*] --> NEW : Thêm món vào đơn (Từ QR hoặc POS tại quầy)
NEW --> NEW : Sửa trực tiếp số lượng / Cấp độ cay / Đổi bàn (Êm thấm, không in phiếu)
NEW --> DELETED : Xoá trực tiếp khỏi bảng (Hard Delete)
NEW --> PRINTED : Thu ngân bấm nút [Tách đơn] (In ra phiếu Bếp nấu / Bếp chiên / Pha chế)
PRINTED --> PRINTED : Sửa cấp độ cay / Số lượng sau khi đã tách bếp (In Phiếu Báo Điều Chỉnh)
PRINTED --> PRINTED : Đổi bàn / Gộp bàn (In Phiếu Báo Chuyển Bàn từ Bàn 1 -> Bàn 7)
PRINTED --> CANCELLED : Huỷ món sau khi đã tách bếp (In Phiếu Báo Huỷ Món xuống bếp)
DELETED --> [*]
CANCELLED --> [*]
```

## PHẦN 3: ĐẶC TẢ CHI TIẾT RESTFUL API (API SPECIFICATION)

Tất cả các API quản trị đều yêu cầu Header Authorization: Bearer <access_token>.

- Nếu Token không hợp lệ hoặc hết hạn: Trả về 401 Unauthorized.

- Nếu tài khoản cố tình truy cập API/Route không nằm trong ma trận phân quyền của Module 8: Trả về 403 Forbidden.

## 3.1. Nhóm API Đặt món QR, POS Thu ngân, Tách bếp & Chuyển/Gộp bàn (Module 0 & 1)

| Phương thức & Endpoint | Quyền hạn | Mục đích & Xử lý Nghiệp vụ |
| --- | --- | --- |
|   | (RBAC) |   |
| GET /api/v1/public/menu | Public (Kèm | Trả về menu, cấp độ cay, topping và kiểm tra phiên đơn hàng hiện |
|   | qr_token) | tại của khách |
| POST /api/v1/public/orders/qr | Public (Kèm | Khách gửi đơn từ QR. Tự động nối vào đơn đúng bàn nếu khách |
|   | qr_token) | đã chuyển từ Bàn 1 sang Bàn 7 |
| POST /api/v1/pos/orders | pos:create | Thu ngân tự bấm tạo đơn trực tiếp tại máy (Chọn số bàn hoặc tự |
|   |   | sinh mã Mang về #01) |
| PATCH /api/v1/pos/orders/:id/items | pos:update | Thêm món mới, sửa số lượng/cấp độ cay hoặc huỷ món trong đơn |
|   |   | đang mở |


| Phương thức & Endpoint | Quyền hạn | Mục đích & Xử lý Nghiệp vụ |
| --- | --- | --- |
|   | (RBAC) |   |
| POST /api/v1/pos/orders/:id/split- | pos:create | Tách đơn 3 bếp: Lọc các món NEW, chuyển sang PRINTED và trả |
| kitchen |   | về dữ liệu in 3 phiếu |
| POST /api/v1/pos/orders/:id/table-action pos:update |   | Thực hiện Chuyển bàn (MOVE), Gộp bàn (MERGE), Đổi bàn (SWAP) |
|   |   | hoặc đổi sang Mang về |
| GET /api/v1/pos/orders/:id/provisional- | pos:read | Lấy dữ liệu In tạm tính kèm đường dẫn ảnh Mã VietQR động |
| bill |   | theo tổng tiền hiện tại |
| POST /api/v1/pos/orders/:id/checkout | pos:create | Chốt Thanh toán (CASH, TRANSFER, SPLIT), đóng đơn sang PAID |
|   |   | và giải phóng bàn |

## Chi tiết Payload các API quan trọng nhất ở Module 1:

- 1. API Thu ngân tạo đơn trực tiếp tại quầy (POST /api/v1/pos/orders)

- Hỗ trợ cả khách gọi tại quầy chọn bàn (DINE_IN) lẫn khách mua mang về (TAKEAWAY):

```
// REQUEST BODY
{
"orderType": "TAKEAWAY", // Hoặc "DINE_IN"
"tableId": null, // Truyền ID bàn (ví dụ: 5) nếu orderType = "DINE_IN"
"note": "Lấy thêm ớt bột rời",
"items": [
{
"productId": 101,
"quantity": 2,
"modifiers": [
{ "groupId": 1, "modifierId": 3, "name": "Cấp độ 2", "extraPrice": 0 },
{ "groupId": 2, "modifierId": 8, "name": "Thêm Bò viên", "extraPrice": 15000 }
],
"itemNote": "1 tô không hành"
}
]
}
// RESPONSE (201 Created)
{
"orderId": 542,
"orderCode": "HD-20261107-0042",
"orderType": "TAKEAWAY",
"displayLabel": "Mang về #08", // Tự động tăng số thứ tự Mang về trong ngày
"status": "SERVING",
"totalAmount": 130000,
"hasUnprintedItems": true
}
```

- 2. API Chuyển bàn / Gộp bàn / Hoán đổi bàn (POST /api/v1/pos/orders/:id/table-action)

- Giải quyết trọn vẹn bài toán nhân viên bấm nhầm số bàn hoặc khách chuyển từ Bàn 1 sang Bàn 7:

```
// REQUEST BODY
{
"action": "MOVE", // "MOVE" (Chuyển sang bàn trống) | "MERGE" (Gộp vào bàn đang ăn) | "SWAP" (Đổi chéo 2
"targetTableId": 7, // Bàn đích (Bàn 07)
"reason": "Khách xin chuyển qua bàn máy lạnh"
}
// RESPONSE (200 OK)
{
"success": true,
"activeOrderId": 540, // Nếu là MERGE thì trả về ID của hoá đơn Bàn 07 sau khi gộp
"sourceTableStatus": "AVAILABLE",
"targetTableStatus": "OCCUPIED",
"requireKitchenNoticePrint": true, // TRUE nếu trong đơn đã có món ở trạng thái PRINTED
"kitchenTransferSlip": {
"title": "THÔNG BÁO CHUYỂN BÀN",
"fromLabel": "BÀN 01",
"toLabel": "BÀN 07",
"orderCode": "HD-20261107-0039",
"timestamp": "2026-11-07T19:20:15+07:00",
"affectedStations": ["BEP_NAU", "PHA_CHE"]
}
}
```

- 3. API Tách đơn 3 khu vực bếp (POST /api/v1/pos/orders/:id/split-kitchen)

ề


## Tự động phân rã cả món lẻ lẫn món trong Combo về đúng 3 khu vực kèm mã Logo:

```
// RESPONSE (200 OK)
{
"orderCode": "HD-20261107-0039",
"displayLabel": "BÀN 07",
"transferNotice": "Đơn chuyển từ BÀN 01 sang BÀN 07", // Hiển thị nếu bàn này vừa chuyển
"batchNo": 2,
"isAddonBatch": true, // TRUE nếu batchNo > 1 (In dòng chữ "GỌI THÊM - LƯỢT 2")
"tickets": [
{
"station": "BEP_NAU",
"stationTitle": "BẾP NẤU (MÌ CAY)",
"logoType": "CHEF_HAT_NOODLE",
"items": [
{ "name": "Mì Kim Chi Hải Sản", "qty": 1, "modifiers": ["Cấp độ 3", "Thêm Phô mai"], "note": "Ít bắp cải" }
]
},
{
"station": "BEP_CHIEN",
"stationTitle": "BẾP CHIÊN",
"logoType": "FRENCH_FRIES",
"items": [
{ "name": "Khoai tây chiên", "qty": 1, "modifiers": [], "note": "" }
]
},
{
"station": "PHA_CHE",
"stationTitle": "QUẦY NƯỚC UỐNG",
"logoType": "DRINK_CUP",
"items": [
{ "name": "Trà đào cam sả", "qty": 2, "modifiers": ["Ít đá"], "note": "" }
]
}
]
}
```

## 3.2. Nhóm API Quản trị Vận hành (Modules 2, 3, 4, 5, 6, 7, 8, 9)

| Module Phương thức & Endpoint |   | Quyền hạn | Tham số (Query / Body) & Chức năng chính |
| --- | --- | --- | --- |
|   |   | (RBAC) |   |
| 2. Hoá | GET /api/v1/invoices | invoices:read | ? |
| đơn |   |   | fromDate=...&toDate=...&searchField=order_code&keyword=... |
| 2. Hoá | GET /api/v1/invoices/:id | invoices:read | Xem chi tiết món (nút Eye), lịch sử lượt gọi và vết chuyển bàn |
| đơn |   |   |   |
| 2. Hoá | POST | invoices:void | Huỷ hoá đơn kèm voidReason (chỉ Admin/Quản lý có quyền) |
| đơn | /api/v1/invoices/:id/void |   |   |
| 3. |   |   | ?fromDate=...&toDate=...&keyword=... (Lọc lịch sử trên Base |
| Nhập | GET /api/v1/inventory-imports imports:read |   | Table) |
| hàng |   |   |   |
| 3. | POST /api/v1/inventory- |   | Lưu danh sách hàng từ Drawer; tự động thêm vào MDM nếu tên món |
| Nhập | imports | imports:create | mới |
| hàng |   |   |   |
| 3. | DELETE /api/v1/inventory- |   |   |
| Nhập | imports/:id | imports:delete | Xoá mềm dòng nhập hàng (cập nhật is_deleted = true) |
| hàng |   |   |   |
| 4. | GET |   |   |
| Dòng | /api/v1/cashflow/settlements | cashflow:read | ?date=... Lấy danh sách lịch sử kết ca và trạng thái Chuẩn/Dư/Thiếu |
| tiền |   |   |   |
| 4. | PUT /api/v1/cashflow/default- |   |   |
| Dòng | budget | cashflow:config | Admin cấu hình mức Ngân sách mặc định đầu ngày |
| tiền |   |   |   |
| 4. |   |   | Nhập actualCountedCash, đối soát tự động với Đơn tiền mặt & Chi tại |
| Dòng | POST /api/v1/cashflow/settle cashflow:create |   | két |
| tiền |   |   |   |
| 5. |   |   |   |
| Nhân | GET /api/v1/employees | employees:read | ?filterField=specialty&filterValue=BEP_NAU&keyword=... |
| viên |   |   |   |
| 5. | POST /api/v1/employees | employees:create | Tạo nhân viên, tự sinh short_name (V.Anh) và tự lưu MDM nếu mới |
| Nhân |   |   |   |


| Module Phương thức & Endpoint | Quyền hạn | Tham số (Query / Body) & Chức năng chính |
| --- | --- | --- |
|   | (RBAC) |   |
| viên |   |   |
| 5. |   |   |
| Nhân PUT /api/v1/employees/:id | employees:update | Sửa nhân viên (Nút Pencil), đồng bộ với trang Hồ sơ cá nhân |
| viên |   |   |
| 5. |   |   |
| Nhân | DELETE /api/v1/employees/:id employees:delete | Xoá mềm nhân viên (Nút Trash kèm confirm) |
| viên |   |   |
| 6. Lịch GET /api/v1/schedules | schedules:read | ?weekStartDate=2026-11-02 Lấy dữ liệu ma trận 7 ngày x Khung giờ |
| làm |   |   |
| 6. Lịch PUT /api/v1/schedules/bulk- | schedules:update | Nút Lưu toàn bộ bảng lịch tuần; kèm API copy từ tuần trước |
| làm save |   |   |
| 7. |   | ?category=INGREDIENT Dùng cho mọi Dropdown/Combobox toàn hệ |
| Master GET /api/v1/mdm/lookup | authenticated | thống |
| Data |   |   |
| 7. |   |   |
| Master CRUD /api/v1/mdm | mdm:read/write | Quản trị danh mục gốc tại màn hình Master Data |
| Data |   |   |
| 8. |   |   |
| Phân GET /api/v1/users | rbac:read | Lấy danh sách tài khoản trên Base Table phân quyền |
| quyền |   |   |
| 8. |   |   |
| Phân POST /api/v1/users | SUPER_ADMIN | Tạo tài khoản mới (Chỉ Admin mới có quyền gọi API này) |
| quyền |   |   |
| 8. PUT |   | Lưu cấu hình Checkbox màn hình & Dropdown CRUD từ Drawer |
| Phân /api/v1/users/:id/permissions | SUPER_ADMIN | Settings |
| quyền |   |   |
| 9. Hồ |   |   |
| sơ & GET / PUT /api/v1/profile | authenticated | Xem/Sửa thông tin cá nhân, thông tin ngân hàng, upload & crop Avatar |
| UI |   |   |
| 9. Hồ PATCH /api/v1/profile/ui- |   |   |
| sơ & prefs | authenticated | Lưu độ rộng cột Base Table, độ rộng Sidebar và Theme Sáng/Tối |
| UI |   |   |

## PHẦN 4: ĐẶC TẢ SỰ KIỆN THỜI GIAN THỰC (WEBSOCKET EVENTS CONTRACT)

Hệ thống sử dụng Socket.io chia theo 2 nhóm phòng (Rooms):

- pos_cashier_room: Dành cho máy tính tại quầy thu ngân.

- order_session_{orderId}: Dành cho trình duyệt trên điện thoại của khách hàng vừa quét QR.

| Tên sự kiện (Event) | Hướng | Khi nào kích hoạt & Dữ liệu Payload gửi kèm |
| --- | --- | --- |
|   | truyền |   |
|   | Server | Khách vừa quét QR đặt đơn mới lần đầu. Phát âm báo chuông tại máy thu ngân và làm nhấp |
| order:qr_new | Thu ngân | nháy ô bàn màu cam. |
|   | Server | Khách ở bàn đang ăn quét QR gọi thêm món (Lượt 2, Lượt 3). Tự động đẩy các dòng món |
| order:qr_addon | Thu ngân | NEW vào Hoá đơn điện tử đang mở của bàn đó. |
|   | Server | Khi thu ngân Chuyển bàn hoặc Gộp bàn (từ Bàn 1 sang Bàn 7). Điện thoại khách đang mở ĐT |
| order:session_redirected | Khách | tab cũ lập tức đổi nhãn hiển thị trên màn hình thành "Bàn 07" và cập nhật activeOrderId |
|   |   | mới. |
|   | Server | ĐT Khi thu ngân bấm Tách đơn (SERVING) hoặc Thanh toán (PAID), điện thoại khách cập nhật |
| order:status_updated | Khách | trạng thái "Bếp đang chế biến" hoặc "Cảm ơn quý khách". |
|   | Server | Đồng bộ tức thì màu sắc sơ đồ bàn (Trống / Đang ăn / Chờ duyệt) nếu quán mở 2 tab thu |
| table:grid_sync | Thu ngân | ngân hoặc có nhân viên order bằng máy tính bảng phụ. |

Ví dụ Payload xử lý đồng bộ Điện thoại khách khi Chuyển/Gộp bàn (order:session_redirected):

Khi khách ngồi Bàn 1 đã quét QR, sau đó chuyển sang Bàn 7, ngay khoảnh khắc thu ngân bấm chuyển bàn trên máy tính, Server bắn sự kiện này xuống điện thoại của khách:


```
// EVENT: "order:session_redirected" -> gửi tới room "order_session_538"
{
"previousOrderId": 538,
"newActiveOrderId": 540, // Giữ nguyên 538 nếu là MOVE, đổi thành 540 nếu MERGE vào đơn Bàn 7
"previousTableLabel": "Bàn 01",
"newTableId": 7,
"newTableLabel": "Bàn 07",
"message": "Đơn hàng của bạn đã được chuyển sang Bàn 07. Các món gọi thêm sẽ được phục vụ tại Bàn 07."
}
```

Nhờ cơ chế này, dù khách không quét lại mã QR ở Bàn 7 mà cứ dùng tiếp tab trình duyệt đang mở sẵn trên điện thoại để gọi thêm 2 chai nước, đơn gọi thêm vẫn chảy chính xác 100% vào hoá đơn của Bàn 07.

Bạn muốn mình viết tiếp mã nguồn khởi tạo Backend + Database Migration từ bản thiết kế này, hay thiết kế chi tiết Wireframe giao diện màn hình POS Thu ngân trước?

User prompt: Với một dự án như thế này thì cụ thể công nghệ và kiến trúc dùng để xây dựng dự án nên chọn như thế nào để tối ưu hoá được tốt nhất bao gồm cả hiệu suất vận hành; chi phí vận hành; bảo trì và mở rộng?

Response: Đối với quy mô một cửa hàng FnB (khoảng 20–40 bàn, lưu lượng 200–600 đơn/ngày) có định hướng mở rộng lên chuỗi nhiều chi nhánh và do chính bạn (một Full-stack Developer) trực tiếp xây dựng kiêm vận hành, kiến trúc tối ưu nhất không phải là Microservices phức tạp, mà là Modular Monolith (Nguyên khối Phân tách Module) kết hợp End-to-End TypeScript trên hạ tầng Docker + Cloud Edge.

Kiến trúc này giúp tốc độ phản hồi tại quầy thu ngân đạt mức dưới 50ms, chi phí vận hành hạ tầng chỉ tốn khoảng 120.000đ – 150.000đ/tháng, đồng thời giữ mã nguồn cực kỳ sạch để một người vẫn bảo trì và nâng cấp tính năng mới trong vài giờ.

## 1. Lựa chọn Kiến trúc Tổng thể: Tại sao là "Modular Monolith"?

Khi thiết kế hệ thống có 9 module liên kết chặt chẽ (Đặt món QR POS Thu ngân Tách 3 bếp Nhập hàng Kết ca dòng tiền Nhân sự & Lịch làm việc), bạn cần tránh 2 thái cực:

- 1. Không chọn Microservices: Tách riêng từng service cho Order, Inventory, HR sẽ làm phát sinh độ trễ mạng nội bộ, mất tính toàn vẹn giao dịch (Distributed Transaction) khi thực hiện các tác vụ nhạy cảm như Gộp bàn hoặc Kết ca đối soát tiền mặt, và làm tăng gấp 4 lần chi phí thuê Server.

- 2. Không viết Monolith rối rắm (Spaghetti Code): Nhồi nhét chung logic sẽ khiến việc sửa tính năng Nhập hàng làm hỏng luôn tính năng Kết ca.

Giải pháp chuẩn — Modular Monolith trong một Monorepo:

- Toàn bộ Backend chạy trong một tiến trình (Process) duy nhất và kết nối chung một cơ sở dữ liệu PostgreSQL, giúp bạn sử dụng ACID Database Transaction trực tiếp giữa Module Hoá đơn, Module Nhập hàng và Module Dòng tiền với tốc độ tính bằng mili-giây.

- Bên trong mã nguồn, các nghiệp vụ được đóng gói thành các Module độc lập hoàn toàn (PosModule, MenuModule, InventoryModule, CashflowModule, HrScheduleModule, MdmModule, RbacModule). Nếu sau này quán mở rộng lên 20 chi nhánh, bạn có thể tách riêng PosModule ra một server độc lập mà không phải viết lại code.

## 2. Bộ Công nghệ Đề xuất (The Golden Tech Stack)

Bộ công nghệ dưới đây sử dụng 100% ngôn ngữ TypeScript xuyên suốt từ Database lên tới Giao diện, giúp loại bỏ hoàn toàn lỗi lệch kiểu dữ liệu giữa Frontend và Backend:

| Tầng hệ thống | Công nghệ lựa chọn | Lý do tối ưu cho bài toán POS Mì cay & Quản trị ERP |
| --- | --- | --- |
| Quản lý Source | Turborepo + pnpm | Gom Frontend, Backend và thư viện shared-types vào chung 1 Monorepo; chia |
|   |   | sẻ DTO và schema kiểm lỗi tức thì |
| Frontend (POS & | React + Vite + TypeScript | Chuyển trang 0ms (SPA), giữ kết nối WebSocket bền bỉ không bị ngắt khi chuyển |
| Admin) |   | tab, mượt hơn SSR khi thao tác bảng phức tạp |
| UI & Bảng dữ liệu | TailwindCSS + Shadcn/UI + | TanStack Table hỗ trợ sẵn API kéo giãn cột (columnResizeMode), ghim cột và dựng |
|   | TanStack Table v8 | bảng Lịch làm việc kiểu Excel cực nhẹ |
| Quản lý State & | TanStack Query v5 + Zustand | Tự động đồng bộ cache API; khi bấm Đăng xuất chỉ cần gọi |
| Cache |   | queryClient.clear() là xoá sạch cache dữ liệu trong 1 dòng code |
| Backend & | NestJS + Socket.io | Cấu trúc chuẩn Dependency Injection, dễ dàng viết Guard kiểm tra phân quyền |
| Realtime |   | RBAC/CRUD (Module 8) và đẩy đơn QR tức thì |
| ORM & Truy vấn | Prisma ORM (hoặc Drizzle) | Sinh kiểu TypeScript tự động từ Database; hỗ trợ Interactive Transaction |
| DB |   | ($transaction) an toàn tuyệt đối khi Gộp bàn và Kết ca |
| Cơ sở dữ liệu | PostgreSQL 16+ | Hỗ trợ kiểu NUMERIC chính xác cho tiền tệ, JSONB cho Topping/Phân quyền/UI |
|   |   | Prefs, và Partial Unique Index chặn trùng đơn |
| Lưu trữ File & | Cloudflare R2 + Sharp | Lưu ảnh món ăn, Avatar (đã crop) và file CCCD nhân viên; miễn phí 10GB đầu tiên |
| Ảnh |   | và miễn phí 100% phí băng thông tải ảnh |


## 3. Phân tích Tối ưu hoá theo 4 Tiêu chí Cốt lõi

## 3.1. Tối ưu Hiệu suất Vận hành (Performance & Concurrency)

Trong giờ cao điểm (18h30 – 21h00), thu ngân và bếp cần tốc độ phản hồi tức thì và không bao giờ xảy ra xung đột dữ liệu:

- Chống xung đột dữ liệu đồng thời (Concurrency Control bằng Row-Level Locking):

- Tình huống thực tế: Khách ngồi ở Bàn 01 đang bấm điện thoại gọi thêm "1 Trà đào", đúng giây đó thu ngân tại quầy lại bấm nút Gộp Bàn 01 sang Bàn 07 (hoặc bấm Tách đơn).

- Giải pháp kỹ thuật: Sử dụng khoá dòng bi quan (Pessimistic Locking — SELECT ... FOR UPDATE) trong Transaction của PostgreSQL trên bản ghi orders. Khi thu ngân đang thực hiện lệnh Gộp bàn hoặc Tách bếp, truy vấn gọi thêm món của khách sẽ tự động xếp hàng đợi (chỉ khoảng 10–20ms) rồi mới thực thi tiếp vào đúng hoá đơn mới của Bàn 07, đảm bảo không bao giờ mất món hay in sót phiếu bếp.

- Tối ưu giao diện Bảng lớn & Kéo giãn cột (60 FPS UI):

- Ở các màn hình có Base Table nhiều dữ liệu (Hoá đơn, Nhập hàng) và tính năng nắm kéo giãn cột/Sidebar, sử dụng kỹ thuật CSS Variables kết hợp requestAnimationFrame của TanStack Table thay vì re-render toàn bộ React state ở mỗi pixel di chuột.

- Khi người dùng thả chuột sau khi kéo cột, dùng hàm debounce (500ms) để lưu ngầm cấu hình độ rộng vào localStorage và đồng bộ lên trường ui_preferences trên Database mà không làm giật giao diện.

- Nâng cấp cơ chế In nhiệt 3 Khu vực bếp (Từ 1 máy in lên 3 máy in LAN tự động):

- Giai đoạn đầu (1 máy in tại thu ngân): Chạy trình duyệt Chrome ở chế độ --kiosk-printing kết hợp CSS @media print tự cắt rời 3 phiếu như đã thiết kế.

- Giai đoạn nâng cao (Đặt 3 máy in nhiệt cổng LAN tại 3 khu vực bếp): Để nhân viên thu ngân không phải xé giấy và chạy bộ đi phát phiếu cho 3 bếp, bạn chỉ cần cắm 3 máy in nhiệt có cổng mạng LAN (giá khoảng 1,2 – 1,5 triệu/máy) vào cùng cục Router Wifi của quán. Một dịch vụ nhỏ (Print Agent viết bằng Node.js chạy ngay trên máy tính thu ngân) sẽ gửi thẳng luồng byte lệnh in ESC/POS qua giao thức TCP (Port 9100) tới đúng địa chỉ IP của từng máy in (192.168.1.201 cho Bếp nấu, .202 cho Bếp chiên, .203 cho Pha chế). Thu ngân vừa bấm Tách đơn, 3 máy in ở 3 khu vực tự động nhả phiếu và cắt giấy cùng lúc trong 0,2 giây!

## 3.2. Tối ưu Chi phí Vận hành (Cost Optimization — Dưới 150.000đ/tháng)

Nhiều dự án chọn AWS RDS, AWS ECS hay Heroku dẫn đến hoá đơn hàng tháng lên tới 1,5 – 3 triệu đồng dù quán chỉ có vài trăm đơn mỗi ngày. Để tối ưu chi phí về mức thấp nhất mà vẫn đạt độ ổn định trên 99,9%:

```
[Điện thoại Khách (4G/Wifi)] ──► [Cloudflare Pages (Miễn phí CDN)]
│
[Máy tính Thu ngân (POS)] ────────────┴──► [1 Cloud VPS (Docker Compose: ~120k/tháng)]
├── Caddy Server (Tự động HTTPS/SSL)
├── NestJS API + Socket.io Server
├── PostgreSQL 16 (Gắn Volume SSD)
└── CronBackup ──► Cloudflare R2 (Miễn phí)
```

- Frontend (Cloudflare Pages — 0đ/tháng): Đưa toàn bộ ứng dụng React (trang gọi món QR của khách và trang POS/Admin) lên mạng lưới CDN của Cloudflare. Khách hàng quét mã QR bằng mạng 4G cá nhân sẽ tải trang thực đơn kèm hình ảnh món ăn từ máy chủ Cloudflare ngay tại Việt Nam trong chưa đầy 0,4 giây.

- Backend & Database (1 Cloud VPS chạy Docker Compose — ~120.000đ đến 150.000đ/tháng):

- Với khoảng 500 hoá đơn/ngày (tương đương ~180.000 hoá đơn/năm, dung lượng Database chỉ khoảng 150MB/năm), một máy chủ VPS cấu hình 2 vCPU - 4GB RAM - 40GB NVMe SSD (tại các nhà cung cấp có máy chủ ở Việt Nam hoặc Singapore) dư sức chịu tải gấp 10 lần nhu cầu thực tế.

- Đóng gói toàn bộ vào một file docker-compose.yml duy nhất gồm: Caddy (làm Reverse Proxy tự động cấp chứng chỉ bảo mật SSL miễn phí), NestJS Backend, và PostgreSQL.

- Sao lưu dữ liệu tự động (Cloudflare R2 — 0đ/tháng): Thiết lập một container nhẹ chạy lệnh pg_dump tự động vào lúc 03h00 sáng mỗi ngày (sau khi quán đã đóng cửa và kết ca), nén lại và đẩy lên Cloudflare R2. Dù VPS có gặp sự cố vật lý, bạn vẫn khôi phục lại toàn bộ hoá đơn và dòng tiền trong 5 phút.

## 3.3. Tối ưu Khả năng Bảo trì (Maintainability cho 1–2 Developer)

Khi bạn vừa là người phát triển vừa là người hỗ trợ vận hành quán, kiến trúc code cần giúp bạn phát hiện lỗi ngay lúc gõ phím và sửa đổi cực nhanh:

- 1. Chia sẻ Schema kiểm lỗi bằng Zod trong Monorepo:

- Tạo gói packages/shared chứa các schema kiểm tra dữ liệu đầu vào (ví dụ: quy tắc tạo đơn hàng, quy tắc nhập hàng Module 3, danh sách mã quyền RBAC Module 8).

- Cả Form trên React (React Hook Form) lẫn API trên NestJS đều import chung 1 file này. Khi bạn thêm một trường mới vào phiếu Nhập hàng, cả Frontend và Backend tự động đồng bộ quy tắc kiểm lỗi mà không cần viết code 2 lần.

- 2. Kiểm soát Phân quyền tập trung bằng 1 Decorator duy nhất (Module 8):

- Thay vì viết câu lệnh if (user.role === ...) rải rác khắp các hàm xử lý, bạn chỉ cần viết một RbacGuard ở NestJS và gắn nhãn trực tiếp lên đầu từng API:
