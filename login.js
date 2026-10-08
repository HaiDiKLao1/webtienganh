document.addEventListener('DOMContentLoaded', () => {
    // 1. Kiểm tra nếu đã có token VÀ thông tin user thì tự động đá vào Dashboard
    if (localStorage.getItem('accessToken') && localStorage.getItem('user')) {
        auth.redirectByRole();
    } else {
        // Nếu dữ liệu bị hỏng (ví dụ có token nhưng mất user), dọn dẹp cho sạch để tránh lỗi kẹt trang
        localStorage.clear();
    }

    const loginForm = document.getElementById('loginForm');
    const errorMsg = document.getElementById('error-msg');
    const loginBtn = loginForm.querySelector('button[type="submit"]');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Ngăn form load lại trang
        
        // Lấy dữ liệu từ input
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        // Reset thông báo lỗi và đổi trạng thái nút bấm (UX)
        errorMsg.style.display = 'none';
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xử lý...';

        try {
            // 2. Gọi API Đăng nhập (Dùng biến API_BASE_URL đã khai báo bên api.js)
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            // 3. Xử lý kết quả
            if (response.ok && result.data) {
                // Gọi hàm saveTokens từ auth.js để lưu localStorage
                auth.saveTokens(result.data);
                
                // Điều hướng dựa vào Role Code (AD, GV, HS, PH)
                auth.redirectByRole();
            } else {
                // Hiển thị lỗi do sai mật khẩu hoặc tài khoản không tồn tại
                errorMsg.innerText = result.message || 'Sai email hoặc mật khẩu. Vui lòng thử lại!';
                errorMsg.style.display = 'block';
                
                // Khôi phục nút bấm
                loginBtn.disabled = false;
                loginBtn.innerText = 'Đăng nhập';
            }
        } catch (error) {
            console.error('Lỗi kết nối:', error);
            errorMsg.innerText = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng!';
            errorMsg.style.display = 'block';
            
            // Khôi phục nút bấm
            loginBtn.disabled = false;
            loginBtn.innerText = 'Đăng nhập';
        }
    });
});