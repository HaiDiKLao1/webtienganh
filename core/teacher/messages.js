window.teacherMessages = (() => {
    // 1. DỮ LIỆU MẪU (Map với các lớp GV đang dạy và học sinh thuộc lớp)
    const mockClasses = [
        { id: "L3.1-2425", name: "Lớp 3.1 - 2024" },
        { id: "L4.1-2425", name: "Lớp 4.1 - 2024" }
    ];

   const mockStudents = { // Sửa dấu '[' thành '{' ở đây
        "L3.1-2425": [
            { id: "ALL", name: "Tất cả Phụ huynh lớp 3.1" },
            { id: "HS001", name: "Phụ huynh em Nguyễn Văn Trọng" },
            { id: "HS002", name: "Phụ huynh em Trần Thị Bé" }
        ],
        "L4.1-2425": [
            { id: "ALL", name: "Tất cả Phụ huynh lớp 4.1" },
            { id: "HS005", name: "Phụ huynh em Lê Hoàng Phúc" }
        ]
    }; // Sửa dấu ']' thành '}' ở đây

    const mockHistory = [
        { time: "10:30 - Hôm nay", target: "Phụ huynh em Nguyễn Văn Trọng", content: "Trung tâm báo cáo: Cháu Trọng hôm nay hăng hái phát biểu, tiếp thu bài tốt ạ.", status: "DELIVERED" },
        { time: "18:45 - Hôm qua", target: "Tất cả Phụ huynh lớp 3.1", content: "Kính gửi quý phụ huynh, trung tâm nhắc lịch làm bài tập về nhà Unit 1 trang 15. Trân trọng!", status: "DELIVERED" }
    ];

    function init() {
        // Load danh sách lớp vào thẻ select
        const classSelect = document.getElementById('msg-class-select');
        let options = `<option value="">-- Chọn lớp --</option>`;
        mockClasses.forEach(c => {
            options += `<option value="${c.id}">${c.name}</option>`;
        });
        classSelect.innerHTML = options;
        
        renderHistory();
    }

    // 2. LOAD DANH SÁCH HỌC SINH KHI CHỌN LỚP
    function loadStudents() {
        const classId = document.getElementById('msg-class-select').value;
        const studentSelect = document.getElementById('msg-student-select');
        
        if (!classId) {
            studentSelect.innerHTML = `<option value="">-- Vui lòng chọn lớp --</option>`;
            studentSelect.disabled = true;
            return;
        }

        studentSelect.disabled = false;
        let options = `<option value="">-- Chọn người nhận --</option>`;
        (mockStudents[classId] || []).forEach(s => {
            options += `<option value="${s.id}">${s.name}</option>`;
        });
        studentSelect.innerHTML = options;
    }

    // 3. XỬ LÝ GỬI API ZALO VÀ UX CHỐNG SPAM
    function sendMessage() {
        const classId = document.getElementById('msg-class-select').value;
        const studentId = document.getElementById('msg-student-select').value;
        const content = document.getElementById('msg-content').value.trim();

        if (!classId || !studentId || !content) {
            utils.showToast("Vui lòng điền đầy đủ người nhận và nội dung tin nhắn!", "warning");
            return;
        }

        // Chống spam: disable nút và hiện loading
        const btn = document.querySelector('#teacherMsgForm .btn-primary');
        const oldText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Đang đẩy lên Zalo...`;

        // Giả lập gọi API Zalo mất 1.5 giây
        setTimeout(() => {
            // Khôi phục nút
            btn.disabled = false;
            btn.innerHTML = oldText;
            
            // Hiện thông báo bằng thư viện utils
            utils.showToast("Đã đẩy tin nhắn Zalo thành công qua hệ thống ZNS!", "success");
            
            // Lấy tên người nhận để lưu lịch sử
            const studentSelect = document.getElementById('msg-student-select');
            const targetName = studentSelect.options[studentSelect.selectedIndex].text;
            
            // Cập nhật mảng lịch sử (Thêm lên đầu)
            mockHistory.unshift({
                time: "Vừa xong",
                target: targetName,
                content: content,
                status: "DELIVERED"
            });
            renderHistory();
            
            // Xóa trắng form
            document.getElementById('teacherMsgForm').reset();
            loadStudents(); 
        }, 1500);
    }

    // 4. RENDER LỊCH SỬ TIN NHẮN
    function renderHistory() {
        const container = document.getElementById('msg-history-container');
        if (mockHistory.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3 small">Chưa có lịch sử liên lạc nào.</div>`;
            return;
        }

        container.innerHTML = mockHistory.map(h => `
            <div class="msg-history-item p-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-bold text-dark" style="font-size: 0.85rem;">${h.target}</span>
                    <span class="badge bg-success bg-opacity-10 text-success border border-success-subtle" style="font-size: 0.7rem;">
                        <i class="fa-solid fa-check-double me-1"></i>Zalo đã nhận
                    </span>
                </div>
                <p class="small text-muted mb-1 text-truncate" style="max-width: 100%;" title="${h.content}">${h.content}</p>
                <small class="text-secondary" style="font-size: 0.7rem;"><i class="fa-regular fa-clock me-1"></i>${h.time}</small>
            </div>
        `).join('');
    }

    // Kích hoạt load dữ liệu
    setTimeout(init, 200);

    return { loadStudents, sendMessage };
})();