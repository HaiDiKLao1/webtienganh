const API_BASE_URL = 'https://api-english.huy-iot.id.vn/api';

const api = {
    async fetch(endpoint, options = {}) {
        let token = localStorage.getItem('accessToken');
        let headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            let response = await window.fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

            // Nếu Token hết hạn (401), gọi Refresh Token
            if (response.status === 401) {
                const newToken = await this.refreshToken();
                if (newToken) {
                    // Gọi lại request ban đầu với token mới
                    headers['Authorization'] = `Bearer ${newToken}`;
                    response = await window.fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
                } else {
                    if (window.auth) auth.logout();
                    throw new Error("Phiên đăng nhập hết hạn.");
                }
            }

            // Đọc dữ liệu JSON trả về
            const data = await response.json();

            // QUAN TRỌNG: Nếu HTTP status là lỗi (4xx, 5xx), ném ra lỗi để catch block xử lý
            if (!response.ok) {
                const error = new Error(data.message || 'Đã xảy ra lỗi kết nối với máy chủ');
                error.status = response.status; // Truyền HTTP Status Code (VD: 400, 404, 409)
                error.data = data;
                throw error;
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error; // Ném lỗi ra cho các module chức năng (như teacher-salary.js) bắt lại
        }
    },

    async refreshToken() {
        const refresh_token = localStorage.getItem('refreshToken');
        if (!refresh_token) return null;

        try {
            const res = await window.fetch(`${API_BASE_URL}/auth/refresh-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refresh_token })
            });
            const result = await res.json();
            
            if (result.data && result.data.accessToken) {
                localStorage.setItem('accessToken', result.data.accessToken);
                return result.data.accessToken;
            }
            return null;
        } catch (error) {
            return null;
        }
    }
};