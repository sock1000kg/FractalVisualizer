# Trình tạo ảnh Fractal
*(Tiếng Việt | [English](./README.md))*

[Demo](https://sock1000kg.github.io/FractalVisualizer/)

Fractal Visualizer là một công cụ tạo fractal chạy bằng CPU, được xây dựng bằng HTML5 và JavaScript dựa trên logic của tập Julia. Bạn có thể khám phá vô số hoa văn đầy mê hoặc, phóng to để thấy các chi tiết tinh xảo, và lưu lại những fractal yêu thích. Ngoài ra, bạn cũng có thể tuỳ chình màu sắc trong phần "Cài đặt nâng cao" để thoả mãn trí tưởng tượng của mình. Chúc bạn vui vẻ :)

## Tính năng
- Vẽ fractal theo vị trí chuột và sự thay đổi dải màu
- Phóng to/thu nhỏ: ô Zoom hiển thị độ phóng đại (1× là chế độ xem mặc định của từng loại), tối đa 10¹⁵× với bộ vẽ CPU. Con lăn chuột phóng to về phía con trỏ, và bạn có thể gõ giá trị như `2.5` hoặc `1e9` vào ô (chấp nhận ký hiệu khoa học). Một dòng cảnh báo hiện ra khi độ phóng đại vượt quá mức bộ vẽ hiện tại còn vẽ chính xác được: khoảng 10¹¹× với WebGL khi lũy thừa là số nguyên (từ 10⁴× trở đi nó tính bằng độ chính xác kép giả lập), khoảng 10⁵× với WebGL khi lũy thừa là số thập phân, và 10¹³× với CPU. Để xem những vùng sâu nhất, dùng `?renderer=cpu`
- Số lần lặp lên đến 5000 (thanh trượt theo thang logarit) và tuỳ chọn "Auto iterations" tự tăng số lần lặp khi bạn phóng to
- Chế độ đen trắng
- Tải ảnh fractal về máy
- Lưu và xoá dữ liệu của các fractal
- Mode "Simple" cho các máy yếu hơn
- Cho phép người dùng thay đổi độ sâu, độ đậm, độ sáng của fractal
- Nhiều loại fractal: Julia, Mandelbrot và Burning Ship (với Mandelbrot và Burning Ship, chuột quyết định điểm xuất phát)
- Vẽ fractal bằng WebGL (giảm lag). Tự động chuyển sang vẽ bằng CPU nếu không hỗ trợ WebGL; thêm `?renderer=cpu` vào URL để buộc dùng CPU
- Hỗ trợ cảm ứng trên điện thoại và máy tính bảng: một ngón tay để đổi hằng số c (hoặc kéo di chuyển khi đang tạm dừng), hai ngón tay để phóng to/thu nhỏ và di chuyển cùng lúc
- Tô màu mượt: thanh trượt Smoothness giúp xoá các dải màu (100 = hoàn toàn mượt, 0 = kiểu dải màu cổ điển)
- Luỹ thừa: thanh trượt Power (từ 2 đến 8) đổi công thức từ z² thành zⁿ cho mọi loại fractal, ví dụ Julia có đối xứng n lần và Mandelbrot có n−1 thùy. Luỹ thừa không nguyên sẽ hiện một đường nối thẳng, đó là bình thường
- Xem trước liên kết (hai chiều): với Mandelbrot và Burning Ship, một khung nhỏ hiển thị tập Julia ứng với điểm dưới con trỏ (hoặc ngón tay). Với các loại Julia, khung hiển thị tập Mandelbrot / Burning Ship tương ứng kèm dấu thập tại c hiện tại ("bạn đang ở đây"). Nhấp vào canvas để ghim khung xem trước tại điểm đó (loại Mandelbrot; nhấp lần nữa hoặc nhấn Esc để bỏ ghim) hoặc đóng băng c (loại Julia; giống phím P), rồi nhấp hoặc chạm vào chính khung xem trước để mở nó: từ Julia bạn đến Mandelbrot với tâm tại c và dấu thập "c" đánh dấu nơi bạn vừa rời đi (nhấp nháy khoảng 2 giây rồi mờ dần); từ Mandelbrot, điểm đã ghim (hoặc điểm vừa rê qua) trở thành hằng số Julia. Khung Mandelbrot là bản đồ của mọi giá trị c nên hình không đổi theo c; dấu ✛ chỉ p bằng đúng c của bạn. Burning Ship có loại "Burning Ship Julia" riêng. Mẹo: nhấn P để dừng hiệu ứng biến đổi, rồi di chuột để khám phá. Có thể tắt khung này bằng ô xem trước trong Advanced Controls (nhãn ghi tên tập tương ứng, ví dụ "Julia preview"; ô bị ẩn với loại không có tập tương ứng)
- Địa hình 3D: nút **3D** hiển thị khung nhìn hiện tại như một địa hình có ánh sáng (giá trị thoát mượt là độ cao; các điểm nằm trong tập hợp tạo thành một cao nguyên phẳng). Kéo chuột để xoay camera, Shift + kéo hoặc kéo chuột phải để dịch chuyển vùng fractal, con lăn chuột phóng to/thu nhỏ fractal (cùng với Auto iterations), Ctrl + con lăn đổi khoảng cách camera, và thanh trượt Height trong Advanced Controls đổi độ cao của đồi núi (Reset camera đưa camera về góc mặc định). Di chuột vẫn làm c biến đổi trực tiếp. Trên cảm ứng, một ngón tay để xoay và hai ngón tay để chụm phóng to và dịch chuyển. Khung xem trước, các dấu chéo và điểm ghim bị ẩn ở chế độ 3D. Cần WebGL (nút bị vô hiệu hoá khi dùng CPU) và dùng số thực thường nên chỉ chính xác đến khoảng 10⁵×
- Mandelbulb và Juliabulb 3D: hai loại fractal thêm vào danh sách chọn, được vẽ bằng cách raymarching với bộ ước lượng khoảng cách (distance estimator) trong fragment shader (có ánh sáng và che khuất môi trường). **Mandelbulb** là phiên bản 3D của tập Mandelbrot (Power 8 là hình cổ điển); **Juliabulb** là phiên bản Julia của nó với hằng số 3D. Kéo chuột để xoay, con lăn chuột đổi khoảng cách camera (ô zoom hiển thị độ phóng đại), di chuột để đặt c (nhấn P để đóng băng), và thanh trượt **c z** trong Advanced Controls đặt thành phần thứ ba của c. Thanh Power (2 đến 8, cho phép số thập phân), Iterations (tối đa 64 với các bulb), các thiết lập màu và chế độ B&W / Simple đều có tác dụng; Reset camera đưa góc nhìn về mặc định. Trên cảm ứng, một ngón tay để xoay và hai ngón tay chụm để đổi khoảng cách. Cần WebGL (các lựa chọn bị vô hiệu hoá khi dùng CPU) và không có khung xem trước. Khi chuyển về loại 2D, Power được đặt lại là 2
- Phương trình: một dòng dưới thanh điều khiển hiển thị phương trình của chế độ xem hiện tại với giá trị trực tiếp, và khung xem trước có chú thích riêng. z là số đang được lặp, n là Power (hiện dạng số mũ trên, hoặc ^2.5 với số lẻ), z₀ là giá trị bắt đầu, c là hằng số của tập Julia và p là điểm ảnh được dùng làm hằng số ở các loại Mandelbrot. Ở loại Mandelbrot, điểm ảnh là hằng số p; ở loại Julia, điểm ảnh là giá trị bắt đầu z₀ còn c lấy từ chuột

## Hình ảnh
<img width="1920" height="1080" alt="Funky Pink" src="https://github.com/user-attachments/assets/2ff3a9d5-3f40-4ecb-b6bc-1a14bc7c04e4" />
<img width="1229" height="691" alt="fractal" src="https://github.com/user-attachments/assets/026eace9-b995-48d4-9472-30d1eff6de41" />
<img width="1920" height="1080" alt="Snow Chaos" src="https://github.com/user-attachments/assets/0005908d-0726-4d1a-ba04-2246f390eb75" />
<img width="1222" height="591" alt="fractal (3)" src="https://github.com/user-attachments/assets/a097a270-3e62-477f-b95f-00eecbc2373a" />
<img width="1222" height="591" alt="fractal (2)" src="https://github.com/user-attachments/assets/c870d404-6249-4a46-97b8-140778677db8" />

## Ghi chú
Mình lấy cảm hứng từ video "I coded one project EVERY WEEK for a YEAR" của Carter Semrad. Vì đặc biệt ấn tượng với dự án tạo fractal nên mình quyết định thử tự xây dựng một phiên bản của riêng mình và thêm vào một số tính năng.
