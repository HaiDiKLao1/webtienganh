const marketingManager = (() => {
    // Khớp SQL: announcements
    let mockAnnouncements = [
        { id: 1, title: "Tuyển sinh Khóa mùa hè 2024", display_type: "POPUP", start_date: "2024-05-01", is_active: true },
        { id: 2, title: "Giảm 20% cho học sinh mới", display_type: "SLIDER", start_date: "2024-06-01", is_active: false }
    ];

    function loadData() {
        const tbody = document.getElementById('marketing-tbody');
        tbody.innerHTML = mockAnnouncements.map(a => {
            let typeColor = a.display_type === 'POPUP' ? 'primary' : 'warning text-dark';
            return `
            <tr>
                <td class="ps-4 fw-semibold text-dark">${a.title}</td>
                <td><span class="badge bg-${typeColor} marketing-type-badge">${a.display_type}</span></td>
                <td><i class="fa-regular fa-calendar me-2 text-muted"></i>${utils.formatDate(a.start_date)}</td>
                <td>
                    <div class="form-check form-switch fs-5">
                        <input class="form-check-input cursor-pointer" type="checkbox" ${a.is_active ? 'checked' : ''}>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    loadData();
    return { loadData };
})();