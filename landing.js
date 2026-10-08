document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('accessToken');
    const userRaw = localStorage.getItem('user');

    if (token && userRaw) {
        try {
            const user = JSON.parse(userRaw);
            if (user && Array.isArray(user.roles)) {
                // Định nghĩa danh sách các trang theo phân quyền giống hệt file auth.js của bạn
                const roleMap = {
                    OWNER: "/core/admin/admin-layout.html",
                    AD: "/core/admin/admin-layout.html",
                    GV: "/core/teacher/teacher-layout.html",
                    HS: "/core/student/student-layout.html",
                    PH: "/core/parent/parent-layout.html",
                };

                const priority = ["OWNER", "AD", "GV", "HS", "PH"];
                
                // Tìm quyền cao nhất của cơ tài khoản hiện tại
                const topRole = priority.find((code) => 
                    user.roles.some((r) => r.code === code)
                );

                // Ép đá trang ngay lập tức
                if (topRole && roleMap[topRole]) {
                    window.location.href = roleMap[topRole];
                    return; // Dừng xử lý luôn
                }
            }
        } catch (e) {
            console.error("Lỗi phân quyền tự động:", e);
        }
    }
});