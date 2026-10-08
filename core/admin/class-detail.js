window.classDetailManager = (() => {
  const esc = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const classId = localStorage.getItem("currentClassDetailId");
  let currentClassFee = 0;
  let currentClassStatus = "";

  // Dữ liệu cho các Tab
  let stPage = 1;
  const stLimit = 10;
  let stKeyword = "";
  let stStatus = "";

  let originalTeachers = [];
  let filteredTeachers = [];
  let tcPage = 1;
  const tcLimit = 10;

  let originalCourses = [];
  let filteredCourses = [];
  let coPage = 1;
  const coLimit = 10;

  // Modals & Timers
  let addStudentModalInstance = null;
  let addTeacherModalInstance = null;
  let addCourseModalInstance = null;
  let scheduleModalInstance = null;

  let searchTimer = null;
  let inputSearchTimer = null;

  const selectedStudentsMap = new Map();
  const selectedTeachersMap = new Map();
  const selectedCoursesMap = new Map();

  // Biến lưu trữ lịch trình
  let classSchedules = [];

  // =========================================================================
  // 0. HỖ TRỢ TOAST & LỖI & CO DÃN BẢNG
  // =========================================================================
  const showErr = (err) => {
    const msg =
      typeof err === "string"
        ? err
        : err?.message || "Có lỗi xảy ra, vui lòng thử lại!";
    utils.showToast(msg, "danger");
  };

  const showSuccess = (msg) => {
    utils.showToast(msg, "success");
  };

  const BOTTOM_GAP = 32;

  function adjustTableHeight() {
    const activeTab = document.querySelector(".tab-pane.active");
    if (!activeTab) return;
    const wrapper = activeTab.querySelector(".detail-table-wrapper");
    const pagination = activeTab.querySelector("div[id$='-pagination']");
    if (!wrapper) return;
    const top = wrapper.getBoundingClientRect().top;
    if (top <= 0) return;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;
    wrapper.style.maxHeight = Math.max(available, 400) + "px";
    wrapper.style.height = "auto";
  }

  window.addEventListener("resize", adjustTableHeight);

  // ĐÃ SỬA: Tự động refresh ngầm khi chuyển tab
  function initTabListener() {
    const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]');
    tabEls.forEach((el) => {
      el.addEventListener("shown.bs.tab", (e) => {
        adjustTableHeight();

        // Lấy mục tiêu của tab vừa bật
        const target = e.target.getAttribute("data-bs-target");

        // Gọi API tải lại dữ liệu ngầm (isSilent = true) để bảng không bị nháy
        if (target === "#tab-students") {
          loadClassStudents(stPage, true);
        } else if (target === "#tab-teachers") {
          loadClassTeachers(true);
        } else if (target === "#tab-courses") {
          refreshCoursesTab(true);
        } else if (target === "#tab-schedules") {
          loadClassSchedules(true);
        }
      });
    });
  }

  // =========================================================================
  // 1. TẢI THÔNG TIN TỔNG QUAN LỚP HỌC
  // =========================================================================
  async function loadClassDetail() {
    if (!classId) {
      showErr("Không tìm thấy thông tin lớp học. Vui lòng thử lại!");
      goBack();
      return;
    }

    document.getElementById("detail-teachers-tbody").innerHTML =
      `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải...</td></tr>`;
    document.getElementById("detail-schedules-tbody").innerHTML =
      `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải...</td></tr>`;
    document.getElementById("detail-courses-tbody").innerHTML =
      `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải...</td></tr>`;

    try {
      const res = await api.fetch(`/classes/${classId}`);
      if (!res?.data)
        throw new Error(res?.message || "Không thể tải dữ liệu lớp");

      const d = res.data;
      currentClassFee = Number(d.totalFee || 0);
      currentClassStatus = (d.status || "").toLowerCase();

      document.getElementById("cd-class-code").textContent = d.classCode;
      document.getElementById("cd-class-code-sub").textContent = d.classCode;
      document.getElementById("cd-class-name").textContent = d.className;

      const courseNameEl = document.getElementById("cd-course-name");
      if (courseNameEl) {
        if (d.currentCourseName) {
          courseNameEl.innerHTML = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle px-2 py-1">${esc(d.currentCourseName)}</span>`;
        } else {
          courseNameEl.innerHTML = `<span class="text-muted fst-italic small">Chưa gán khóa</span>`;
        }
      }

      document.getElementById("cd-grade-year").innerHTML =
        `Khối ${d.grade} <br><small class="text-muted">${d.academicYear}</small>`;
      document.getElementById("cd-capacity").innerHTML =
        `<i class="fa-solid fa-users text-muted me-1"></i> ${d.currentStudents || 0} / ${d.maxStudents || 0}`;

      document.getElementById("cd-fee").textContent =
        `${currentClassFee.toLocaleString("vi-VN")} đ`;

      let badgeStatus = "";
      let startBtn = "";

      if (currentClassStatus === "open") {
        badgeStatus =
          '<span class="badge bg-success bg-opacity-75">Đang mở</span>';
      } else if (currentClassStatus === "pending") {
        badgeStatus =
          '<span class="badge bg-warning text-dark bg-opacity-75">Đang chờ</span>';
        startBtn = `<button class="btn btn-sm btn-danger ms-3 shadow-sm fw-semibold" onclick="window.classDetailManager.startClass()"><i class="fa-solid fa-play me-1"></i> Bắt đầu</button>`;
      } else {
        badgeStatus =
          '<span class="badge bg-secondary bg-opacity-75">Đã đóng</span>';
      }

      document.getElementById("cd-status").innerHTML =
        `<div class="d-flex align-items-center">${badgeStatus} ${startBtn}</div>`;

      // 1. Tải Học sinh
      loadClassStudents(1);

      // 2. Tải Giáo viên
      loadClassTeachers();

      // 3. Tải Khóa học (Đã tách thành hàm riêng để hỗ trợ tự refresh)
      refreshCoursesTab();

      // 4. Tải Lịch học
      classSchedules = d.schedules || [];
      loadClassSchedules();

      setTimeout(adjustTableHeight, 50);
    } catch (error) {
      showErr(error);
    }
  }

  async function startClass() {
    if (window.utils) {
      const confirm = await utils.confirm(
        "Bạn có chắc chắn muốn bắt đầu lớp học này không?",
        { title: "Bắt đầu lớp học", confirmText: "Bắt đầu", type: "primary" },
      );
      if (!confirm) return;
    } else {
      if (!confirm("Bắt đầu lớp học này?")) return;
    }

    try {
      const res = await api.fetch(`/classes/${classId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "open" }),
      });
      if (res && res.error) throw new Error(res.message);

      showSuccess("Lớp học đã bắt đầu thành công!");
      loadClassDetail();
    } catch (err) {
      showErr(err);
    }
  }

  // =========================================================================
  // 2. TAB HỌC SINH
  // =========================================================================
  async function loadClassStudents(page = 1, isSilent = false) {
    stPage = page;
    const tbody = document.getElementById("detail-students-tbody");
    if (!tbody) return;

    if (!isSilent) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải...</td></tr>`;
    }

    try {
      const queryParams = new URLSearchParams({
        page: stPage,
        limit: stLimit,
        keyword: stKeyword,
        status: stStatus,
      }).toString();
      const res = await api.fetch(
        `/classes/${classId}/students?${queryParams}`,
      );

      if (res && res.error) throw new Error(res.message);
      if (!res?.data || !res?.data?.items)
        throw new Error(res?.message || "Dữ liệu trả về không hợp lệ");

      const students = res.data.items;
      const pagination = res.pagination;

      if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Không có học sinh nào phù hợp.</td></tr>`;
        renderPaginationUI(
          "class-students-pagination",
          1,
          1,
          0,
          "window.classDetailManager.goToStPage",
        );
        setTimeout(adjustTableHeight, 50);
        return;
      }

      tbody.innerHTML = students
        .map((s) => {
          const originalFee = Number(s.original_fee || 0);
          const finalFee = Number(s.final_fee || 0);
          const discountPercent = parseFloat(s.discount_percent || 0);

          let discountBadge = "";
          let feeDisplay = "";

          if (discountPercent > 0) {
            feeDisplay = `
              <div class="d-flex flex-column">
                <span class="text-success fw-bold">${finalFee.toLocaleString("vi-VN")} đ</span>
                <span class="text-muted text-decoration-line-through small" style="font-size: 11px;">${originalFee.toLocaleString("vi-VN")} đ</span>
              </div>
            `;
            const noteText = s.note ? esc(s.note) : "";
            const noteHtml = s.note
              ? `<small class="fst-italic text-muted fw-normal ms-1 text-truncate" style="max-width: 140px;" title="${noteText}">- ${noteText}</small>`
              : "";

            discountBadge = `
              <div class="mt-1 d-flex align-items-center">
                <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle flex-shrink-0">Giảm ${discountPercent}%</span> 
                ${noteHtml}
              </div>`;
          } else {
            feeDisplay = `<span class="text-success fw-bold">${finalFee.toLocaleString("vi-VN")} đ</span>`;
          }

          const statusText =
            (s.status || "").toLowerCase() === "inactive"
              ? "Nghỉ học"
              : "Đang học";
          const statusClass =
            (s.status || "").toLowerCase() === "inactive"
              ? "bg-secondary"
              : "bg-success";

          return `
            <tr>
              <td class="ps-3"><span class="badge bg-light text-dark border">${esc(s.student_code)}</span></td>
              <td><div class="fw-semibold text-dark">${esc(s.full_name)}</div>${discountBadge}</td>
              <td><small class="text-muted d-block"><i class="fa-solid fa-phone me-1"></i>${esc(s.phone || "N/A")}</small><small class="text-muted d-block"><i class="fa-solid fa-envelope me-1"></i>${esc(s.email || "N/A")}</small></td>
              <td>${feeDisplay}</td>
              <td><span class="badge ${statusClass} bg-opacity-75">${statusText}</span></td>
              <td class="text-end pe-3">
                <button class="btn btn-sm btn-light text-danger border shadow-sm" title="Xóa khỏi lớp" onclick="window.classDetailManager.removeStudentFromClass(${s.student_id})"><i class="fa-solid fa-trash-can"></i></button>
              </td>
            </tr>`;
        })
        .join("");

      renderPaginationUI(
        "class-students-pagination",
        pagination.currentPage,
        pagination.totalPages,
        pagination.totalRecords,
        "window.classDetailManager.goToStPage",
      );
      setTimeout(adjustTableHeight, 50);
    } catch (error) {
      console.error("Chi tiết lỗi API:", error);
      showErr(
        "Không thể lấy danh sách học sinh. Vui lòng kiểm tra lại kết nối!",
      );
      if (!isSilent)
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Lỗi kết nối máy chủ! Không thể tải dữ liệu.</td></tr>`;
    }
  }

  function filterClassStudents() {
    clearTimeout(inputSearchTimer);
    inputSearchTimer = setTimeout(() => {
      stKeyword = (
        document.getElementById("search-class-student")?.value || ""
      ).trim();
      loadClassStudents(1);
    }, 500);
  }

  function goToStPage(p) {
    loadClassStudents(p);
  }

  async function removeStudentFromClass(studentId) {
    const confirm = await utils.confirm(
      "Chắc chắn muốn xóa học sinh này khỏi lớp?",
      { title: "Xóa Học Sinh", type: "danger" },
    );
    if (!confirm) return;

    try {
      // API call placeholder
      // await api.fetch(`/classes/${classId}/students/${studentId}`, { method: 'DELETE' });
      showSuccess("Đã xóa học sinh khỏi lớp.");
      loadClassStudents(stPage, true);
    } catch (e) {
      showErr(e);
    }
  }

  // =========================================================================
  // 3. TAB GIÁO VIÊN
  // =========================================================================
  function filterClassTeachers() {
    const kw = (document.getElementById("search-class-teacher")?.value || "")
      .toLowerCase()
      .trim();
    filteredTeachers = originalTeachers.filter(
      (t) =>
        (t.fullName || "").toLowerCase().includes(kw) ||
        (t.teacherCode || t.teacher_code || "").toLowerCase().includes(kw) ||
        (t.phone || "").includes(kw),
    );
    tcPage = 1;
    renderClassTeachers();
  }

  function renderClassTeachers() {
    const tbody = document.getElementById("detail-teachers-tbody");
    if (!tbody) return;

    if (filteredTeachers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Không có giáo viên nào phù hợp.</td></tr>`;
      renderPaginationUI(
        "class-teachers-pagination",
        1,
        1,
        0,
        "window.classDetailManager.goToTcPage",
      );
      setTimeout(adjustTableHeight, 50);
      return;
    }

    const total = filteredTeachers.length;
    const totalPages = Math.ceil(total / tcLimit);
    const start = (tcPage - 1) * tcLimit;
    const paginated = filteredTeachers.slice(start, start + tcLimit);

    tbody.innerHTML = paginated
      .map(
        (t) => `
        <tr>
          <td class="ps-3 align-middle"><span class="badge bg-light text-dark border">${esc(t.teacherCode || t.teacher_code)}</span></td>
          <td class="fw-semibold text-dark align-middle">${esc(t.fullName)}</td>
          <td class="align-middle"><span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle">${t.role === "MAIN" ? "Dạy chính" : "Trợ giảng"}</span></td>
          <td class="text-start">
            <small class="text-muted d-block mb-1"><i class="fa-solid fa-envelope me-1"></i>${esc(t.email || "Chưa cập nhật")}</small>
            <small class="text-muted d-block"><i class="fa-solid fa-phone me-1"></i>${esc(t.phone || "Chưa cập nhật")}</small>
          </td>
          <td class="text-end pe-3 align-middle">
            <button class="btn btn-sm btn-light text-primary border shadow-sm me-1" title="Sửa vai trò" onclick="window.classDetailManager.editTeacherInClass(${t.id || t.teacherId}, '${t.role}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-light text-danger border shadow-sm" title="Xóa phân công" onclick="window.classDetailManager.removeTeacherFromClass(${t.id || t.teacherId})"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
    `,
      )
      .join("");

    renderPaginationUI(
      "class-teachers-pagination",
      tcPage,
      totalPages,
      total,
      "window.classDetailManager.goToTcPage",
    );
    setTimeout(adjustTableHeight, 50);
  }

  function editTeacherInClass(teacherId, currentRole) {
    utils.showToast(
      "Tính năng sửa phân công giáo viên đang được phát triển",
      "info",
    );
  }

  function goToTcPage(p) {
    tcPage = p;
    renderClassTeachers();
  }

  async function removeTeacherFromClass(teacherId) {
    const confirm = await utils.confirm(
      "Chắc chắn muốn xóa phân công của giáo viên này?",
      { title: "Xóa Giáo Viên", type: "danger" },
    );
    if (!confirm) return;
    try {
      const finalTeachersPayload = originalTeachers
        .filter((t) => (t.id || t.teacherId || t.teacher_id) !== teacherId)
        .map((t) => ({
          teacherId: t.id || t.teacherId || t.teacher_id,
          role: t.role,
        }));

      const res = await api.fetch(`/classes/${classId}/link-teachers`, {
        method: "POST",
        body: JSON.stringify({ teacherIds: finalTeachersPayload }),
      });

      if (res && res.error) throw new Error(res.message);
      showSuccess("Đã xóa phân công giáo viên.");

      if (res.data && Array.isArray(res.data)) {
        originalTeachers = res.data.map((t) => ({
          id: t.teacher_id || t.id,
          teacherCode: t.teacher_code || t.teacherCode,
          fullName: t.full_name || t.fullName,
          phone: t.phone,
          email: t.email,
          role: t.role,
        }));
        filterClassTeachers();
      } else {
        loadClassTeachers(true);
      }
    } catch (e) {
      showErr(e);
    }
  }

  // ĐÃ SỬA: Hỗ trợ isSilent
  async function loadClassTeachers(isSilent = false) {
    const tbody = document.getElementById("detail-teachers-tbody");
    if (!tbody) return;

    if (!isSilent) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải dữ liệu giáo viên...</td></tr>`;
    }

    try {
      const res = await api.fetch(`/classes/${classId}/teachers`);

      if (res && res.error) throw new Error(res.message);

      // ĐÃ SỬA TẠI ĐÂY: Trỏ thẳng vào res.data.items theo cấu trúc API mới
      // Thêm dự phòng res.data để nếu API trả về mảng trực tiếp thì code vẫn không bị lỗi
      const apiTeachers = res?.data?.items || res?.data || [];

      originalTeachers = apiTeachers.map((t) => ({
        id: t.teacher_id,
        teacherCode: t.teacher_code,
        fullName: t.full_name,
        phone: t.phone,
        email: t.email,
        role: t.role,
        status: t.status, // Có thêm trạng thái status từ API mới
        assignedAt: t.assigned_at,
      }));

      filterClassTeachers();
    } catch (error) {
      console.error("Lỗi lấy danh sách giáo viên:", error);
      if (!isSilent)
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối máy chủ. Không thể tải danh sách giáo viên!</td></tr>`;
    }
  }

  // =========================================================================
  // 4. TAB KHÓA HỌC
  // =========================================================================
  // ĐÃ THÊM: Tách fetch course thành hàm riêng để tự refresh tab
  async function refreshCoursesTab(isSilent = false) {
    const tbody = document.getElementById("detail-courses-tbody");
    if (!tbody) return;

    if (!isSilent) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải khóa học...</td></tr>`;
    }

    try {
      const courseRes = await api.fetch(`/classes/${classId}/course`);
      originalCourses = courseRes?.data || [];
      filterClassCourses();
    } catch (err) {
      console.warn("Lỗi khi lấy dữ liệu khóa học:", err);
      originalCourses = [];
      filterClassCourses();
    }
  }

  function filterClassCourses() {
    const kw = (document.getElementById("search-class-course")?.value || "")
      .toLowerCase()
      .trim();
    filteredCourses = originalCourses.filter(
      (c) =>
        (c.courseName || c.course_name || "").toLowerCase().includes(kw) ||
        (c.courseCode || c.course_code || "").toLowerCase().includes(kw),
    );
    coPage = 1;
    renderClassCourses();
  }

  function renderClassCourses() {
    const tbody = document.getElementById("detail-courses-tbody");
    if (!tbody) return;

    if (filteredCourses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có khóa học nào được gán cho lớp này.</td></tr>`;
      renderPaginationUI(
        "class-courses-pagination",
        1,
        1,
        0,
        "window.classDetailManager.goToCoPage",
      );
      setTimeout(adjustTableHeight, 50);
      return;
    }

    const total = filteredCourses.length;
    const totalPages = Math.ceil(total / coLimit);
    const start = (coPage - 1) * coLimit;
    const paginated = filteredCourses.slice(start, start + coLimit);

    tbody.innerHTML = paginated
      .map((c) => {
        const fee = Number(
          c.totalFee || c.standardFee || c.standard_fee || 0,
        ).toLocaleString("vi-VN");
        return `
        <tr>
          <td class="ps-3"><span class="badge bg-light text-dark border fw-bold">${esc(c.courseCode || c.course_code)}</span></td>
          <td class="fw-semibold text-dark">${esc(c.courseName || c.course_name)}</td>
          <td class="text-center"><span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle px-2">${c.totalSessions || c.total_sessions || 0} Buổi</span></td>
          <td><span class="text-success fw-semibold">${fee} đ</span></td>
          <td class="text-end pe-3">
            <button class="btn btn-sm btn-light text-danger border shadow-sm" title="Xóa khỏi lớp" onclick="window.classDetailManager.removeCourseFromClass(${c.id})"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
    `;
      })
      .join("");

    renderPaginationUI(
      "class-courses-pagination",
      coPage,
      totalPages,
      total,
      "window.classDetailManager.goToCoPage",
    );
    setTimeout(adjustTableHeight, 50);
  }

  function goToCoPage(p) {
    coPage = p;
    renderClassCourses();
  }

  async function removeCourseFromClass(courseId) {
    const confirm = await utils.confirm(
      "Chắc chắn muốn xóa khóa học này khỏi lớp?",
      { title: "Xóa Khóa Học", type: "danger" },
    );
    if (!confirm) return;
    try {
      showSuccess("Đã xóa khóa học khỏi lớp.");
      refreshCoursesTab(true);
    } catch (e) {
      showErr(e);
    }
  }

  // =========================================================================
  // 5. TAB LỊCH HỌC
  // =========================================================================
  function renderSchedules() {
    const scBody = document.getElementById("detail-schedules-tbody");
    if (!scBody) return;

    if (classSchedules && classSchedules.length > 0) {
      scBody.innerHTML = classSchedules
        .map((sc) => {
          let shiftDisplay = esc(sc.shiftName || sc.shift_name || "");
          switch (shiftDisplay) {
            case "CA1":
              shiftDisplay = "Ca sáng 1";
              break;
            case "CA2":
              shiftDisplay = "Ca sáng 2";
              break;
            case "CA3":
              shiftDisplay = "Ca chiều";
              break;
            case "CA4":
              shiftDisplay = "Ca tối 1";
              break;
            case "CA5":
              shiftDisplay = "Ca tối 2";
              break;
          }

          const scheduleId = sc.id || sc.scheduleId || sc.schedule_id;
          const dayVal = sc.dayOfWeek || sc.day_of_week;
          const dayDisplay = dayVal === "CN" ? "Chủ Nhật" : `Thứ ${dayVal}`;

          const startTime = (
            sc.startTime ||
            sc.start_time ||
            "00:00:00"
          ).substring(0, 5);
          const endTime = (sc.endTime || sc.end_time || "00:00:00").substring(
            0,
            5,
          );

          return `
          <tr>
            <td class="ps-3 fw-bold text-primary">${dayDisplay}</td>
            <td>
              <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle px-2">
                ${shiftDisplay}
              </span>
            </td>
            <td><small class="text-muted fw-semibold"><i class="fa-regular fa-clock me-1"></i>${startTime}</small></td>
            <td><small class="text-muted fw-semibold"><i class="fa-regular fa-clock me-1"></i>${endTime}</small></td>
            
            <td class="text-end pe-3">
              <button class="btn btn-sm btn-light text-primary border shadow-sm me-1" title="Sửa lịch" onclick="window.classDetailManager.openScheduleModal(${scheduleId})"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-light text-danger border shadow-sm" title="Xóa lịch" onclick="window.classDetailManager.deleteSchedule(${scheduleId})"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          </tr>
      `;
        })
        .join("");
    } else {
      scBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có lịch học được xếp.</td></tr>`;
    }
  }

  // ĐÃ SỬA: Hỗ trợ isSilent
  async function loadClassSchedules(isSilent = false) {
    const scBody = document.getElementById("detail-schedules-tbody");
    if (!scBody) return;

    if (!isSilent && classSchedules.length === 0) {
      scBody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger"></span> Đang tải...</td></tr>`;
    }

    try {
      const res = await api.fetch(`/classes/${classId}/schedules`);
      if (res && res.error) throw new Error(res.message);

      classSchedules = res?.data || [];
      renderSchedules();
    } catch (e) {
      scBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối. Không tải được lịch.</td></tr>`;
    }
  }

  function openScheduleModal(id = null) {
    const el = document.getElementById("scheduleModal");
    if (!el) return;
    scheduleModalInstance ??= new bootstrap.Modal(el);

    document.getElementById("schedule-form").reset();
    document.getElementById("sc-id").value = "";
    document.getElementById("day-error").classList.add("d-none");

    document.querySelectorAll(".sc-day-checkbox").forEach((cb) => {
      cb.checked = false;
      cb.disabled = false;
    });

    if (id) {
      document.getElementById("schedule-modal-title").innerText =
        "Sửa lịch học";
      const sc = classSchedules.find(
        (s) => (s.id || s.scheduleId || s.schedule_id) === id,
      );
      if (sc) {
        document.getElementById("sc-id").value = id;
        document.getElementById("sc-shift").value =
          sc.shiftName || sc.shift_name;

        const dayVal = sc.dayOfWeek || sc.day_of_week;
        document.querySelectorAll(".sc-day-checkbox").forEach((cb) => {
          if (cb.value === String(dayVal)) {
            cb.checked = true;
            cb.disabled = false;
          } else {
            cb.checked = false;
            cb.disabled = true;
          }
        });
      }
    } else {
      document.getElementById("schedule-modal-title").innerText =
        "Thêm lịch học";
    }

    scheduleModalInstance.show();
  }

  async function saveSchedule() {
    const errorEl = document.getElementById("day-error");
    const checkedDays = Array.from(
      document.querySelectorAll(".sc-day-checkbox:checked"),
    ).map((cb) => cb.value);

    if (checkedDays.length === 0) {
      errorEl.classList.remove("d-none");
      return;
    }
    errorEl.classList.add("d-none");

    const id = document.getElementById("sc-id").value;
    const shiftName = document.getElementById("sc-shift").value;

    const btn = document.getElementById("btn-save-schedule");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xử lý...`;

    try {
      if (id) {
        const payload = { dayOfWeek: checkedDays[0], shiftName: shiftName };
        const res = await api.fetch(`/classes/${classId}/schedules/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (res && res.error) throw new Error(res.message);
      } else {
        const schedulesPayload = checkedDays.map((day) => ({
          dayOfWeek: day,
          shiftName: shiftName,
        }));

        const res = await api.fetch(`/classes/${classId}/schedules`, {
          method: "POST",
          body: JSON.stringify({ schedules: schedulesPayload }),
        });
        if (res && res.error) throw new Error(res.message);
      }

      showSuccess(id ? "Cập nhật lịch thành công!" : "Đã lưu lịch học mới!");
      scheduleModalInstance.hide();
      loadClassSchedules(true);
    } catch (e) {
      showErr(e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `Lưu lịch`;
    }
  }

  async function deleteSchedule(id) {
    const ok = await utils.confirm("Bạn có chắc muốn xóa lịch học này?", {
      title: "Xóa Lịch",
      type: "danger",
    });
    if (!ok) return;

    try {
      const res = await api.fetch(`/classes/${classId}/schedules/${id}`, {
        method: "DELETE",
      });
      if (res && res.error) throw new Error(res.message);
      showSuccess("Đã xóa lịch học.");
      loadClassSchedules(true);
    } catch (e) {
      showErr(e);
    }
  }

  // =========================================================================
  // HÀM VẼ GIAO DIỆN PHÂN TRANG DÙNG CHUNG
  // =========================================================================
  function renderPaginationUI(containerId, page, totalPages, total, goFnStr) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (total === 0) {
      container.innerHTML = "";
      return;
    }

    const limit = 10;
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center px-1">
        <span class="text-muted small">Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong></span>
        <ul class="pagination pagination-sm mb-0 gap-1">
            <li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link rounded" onclick="${goFnStr}(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button></li>
            ${buildPageButtons(page, totalPages, goFnStr)}
            <li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link rounded" onclick="${goFnStr}(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button></li>
        </ul>
    </div>`;
  }

  function buildPageButtons(page, totalPages, goFnStr) {
    const delta = 2;
    const rangeStart = Math.max(1, page - delta);
    const rangeEnd = Math.min(totalPages, page + delta);
    let html = "";
    if (rangeStart > 1) {
      html += buildPageBtn(1, page, goFnStr);
      if (rangeStart > 2)
        html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }
    for (let i = rangeStart; i <= rangeEnd; i++)
      html += buildPageBtn(i, page, goFnStr);
    if (rangeEnd < totalPages) {
      if (rangeEnd < totalPages - 1)
        html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      html += buildPageBtn(totalPages, page, goFnStr);
    }
    return html;
  }

  function buildPageBtn(p, currentPage, goFnStr) {
    const isActive = p === currentPage;
    return `<li class="page-item ${isActive ? "active" : ""}"><button class="page-link rounded" onclick="${goFnStr}(${p})">${p}</button></li>`;
  }

  // =========================================================================
  // MODAL LOGIC...
  // =========================================================================
  function openAddStudentModal() {
    const el = document.getElementById("addStudentModal");
    if (!el) return;
    addStudentModalInstance ??= new bootstrap.Modal(el);
    selectedStudentsMap.clear();
    document.getElementById("input-search-student-add").value = "";
    document.getElementById("results-search-student").innerHTML =
      `<div class="text-center text-muted small py-3">Gõ để tìm kiếm...</div>`;
    renderSelectedStudents();
    addStudentModalInstance.show();
  }
  function searchStudentsToAdd(keyword) {
    clearTimeout(searchTimer);
    const resultsEl = document.getElementById("results-search-student");
    if (!keyword.trim()) {
      resultsEl.innerHTML = `<div class="text-center text-muted small py-3">Gõ để tìm kiếm...</div>`;
      return;
    }
    resultsEl.innerHTML = `<div class="text-center text-muted small py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tìm...</div>`;

    searchTimer = setTimeout(async () => {
      try {
        const res = await api.fetch(
          `/students?keyword=${encodeURIComponent(keyword.trim())}&status=active&limit=10`,
        );
        const list = res?.data || [];
        if (list.length === 0) {
          resultsEl.innerHTML = `<div class="text-center text-danger small py-3">Không tìm thấy học sinh!</div>`;
          return;
        }

        resultsEl.innerHTML = list
          .map((s) => {
            const isSelected = selectedStudentsMap.has(s.id);
            const bgClass = isSelected
              ? "bg-danger bg-opacity-10 border border-danger"
              : "bg-white border hover-bg-light";
            return `
          <div id="search-hs-${s.id}" class="search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer ${bgClass}" onclick='window.classDetailManager.selectStudentToAdd(${JSON.stringify(s).replace(/'/g, "&apos;")})'>
            <div><div class="fw-semibold small text-dark">${esc(s.fullName)}</div><div class="text-muted" style="font-size:11px;">Mã HS: ${esc(s.studentCode || s.student_code)}</div></div>
          </div>`;
          })
          .join("");
      } catch (err) {
        resultsEl.innerHTML = `<div class="text-center text-danger small py-3">Lỗi tìm kiếm.</div>`;
      }
    }, 400);
  }
  function selectStudentToAdd(student) {
    if (selectedStudentsMap.has(student.id)) return showErr("Đã chọn!");
    student.isDiscounted = false;
    student.discountPercent = "";
    student.discountNote = "";
    selectedStudentsMap.set(student.id, student);
    renderSelectedStudents();
    const searchItem = document.getElementById(`search-hs-${student.id}`);
    if (searchItem)
      searchItem.className =
        "search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer bg-danger bg-opacity-10 border border-danger";
  }
  function removeStudentToAdd(id) {
    selectedStudentsMap.delete(id);
    renderSelectedStudents();
    const searchItem = document.getElementById(`search-hs-${id}`);
    if (searchItem)
      searchItem.className =
        "search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer bg-white border hover-bg-light";
  }
  function toggleStudentDiscount(id, isChecked) {
    if (selectedStudentsMap.has(id)) {
      const student = selectedStudentsMap.get(id);
      student.isDiscounted = isChecked;
      selectedStudentsMap.set(id, student);
      const container = document.getElementById(`hs-discount-container-${id}`);
      if (container) container.style.display = isChecked ? "flex" : "none";
    }
  }
  function updateStudentDiscountPercent(id, value) {
    if (selectedStudentsMap.has(id)) {
      const student = selectedStudentsMap.get(id);
      if (value !== "") {
        let val = parseInt(value, 10);
        if (val < 1) val = 1;
        if (val > 99) val = 99;
        student.discountPercent = val;
        const inputEl = document.getElementById(`discount-input-${id}`);
        if (inputEl) inputEl.value = val;
      } else {
        student.discountPercent = "";
      }
      selectedStudentsMap.set(id, student);
    }
  }
  function updateStudentDiscountNote(id, value) {
    if (selectedStudentsMap.has(id)) {
      const student = selectedStudentsMap.get(id);
      student.discountNote = value;
      selectedStudentsMap.set(id, student);
    }
  }
  function renderSelectedStudents() {
    const listEl = document.getElementById("list-selected-students");
    document.getElementById("count-selected-students").innerText =
      selectedStudentsMap.size;
    if (selectedStudentsMap.size === 0) {
      listEl.innerHTML = `<div class="text-center text-muted small mt-4">Chưa chọn</div>`;
      return;
    }

    let html = "";
    selectedStudentsMap.forEach((s, id) => {
      html += `
        <div class="d-flex flex-column p-2 mb-2 bg-white shadow-sm rounded" style="border: 1px solid #dee2e6; border-left: 4px solid #dc3545 !important;">
          <div class="d-flex align-items-center justify-content-between">
            <div class="fw-bold small text-dark">${esc(s.fullName)}</div>
            <button class="btn btn-sm btn-link text-danger p-0 m-0" onclick="window.classDetailManager.removeStudentToAdd(${id})"><i class="fa-solid fa-xmark fs-5"></i></button>
          </div>
          <div class="mt-2 pt-2 border-top border-light">
            <div class="form-check form-switch mb-1">
              <input class="form-check-input danger-switch cursor-pointer" type="checkbox" role="switch" id="discount-switch-${id}" ${s.isDiscounted ? "checked" : ""} onchange="window.classDetailManager.toggleStudentDiscount(${id}, this.checked)">
              <label class="form-check-label text-muted small cursor-pointer" for="discount-switch-${id}" style="font-size: 12px; margin-top: 1px;">Áp dụng Giảm giá</label>
            </div>
            <div class="row g-2 mt-1 animate__animated animate__fadeIn" id="hs-discount-container-${id}" style="display: ${s.isDiscounted ? "flex" : "none"};">
              <div class="col-4">
                <input type="number" id="discount-input-${id}" class="form-control form-control-sm border-danger border-opacity-50" placeholder="% Giảm" value="${s.discountPercent}" oninput="window.classDetailManager.updateStudentDiscountPercent(${id}, this.value)">
              </div>
              <div class="col-8">
                <input type="text" class="form-control form-control-sm border-danger border-opacity-50" placeholder="Lý do..." value="${esc(s.discountNote)}" oninput="window.classDetailManager.updateStudentDiscountNote(${id}, this.value)">
              </div>
            </div>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }
  async function submitAddStudents() {
    if (selectedStudentsMap.size === 0)
      return showErr("Vui lòng chọn ít nhất 1 học sinh!");
    const studentsPayload = Array.from(selectedStudentsMap.values()).map(
      (s) => ({
        studentId: s.id,
        discountPercent: s.isDiscounted ? Number(s.discountPercent) || 0 : 0,
        discountNote: s.isDiscounted ? s.discountNote.trim() : "",
      }),
    );
    const btn = document.getElementById("btn-submit-add-students");
    btn.disabled = true;
    try {
      const res = await api.fetch(`/classes/${classId}/link-students`, {
        method: "POST",
        body: JSON.stringify({ students: studentsPayload }),
      });
      if (res && (res.error || res.status === 400 || res.status === 500))
        throw new Error(res.message);
      showSuccess(res?.message || "Thêm học sinh thành công!");
      addStudentModalInstance.hide();
      loadClassStudents(stPage, true);
    } catch (err) {
      showErr(err);
    } finally {
      btn.disabled = false;
    }
  }

  function openAddTeacherModal() {
    const el = document.getElementById("addTeacherModal");
    if (!el) return;
    addTeacherModalInstance ??= new bootstrap.Modal(el);
    selectedTeachersMap.clear();
    document.getElementById("input-search-teacher-add").value = "";
    document.getElementById("results-search-teacher").innerHTML =
      `<div class="text-center text-muted small py-3">Gõ để tìm kiếm...</div>`;
    renderSelectedTeachers();
    addTeacherModalInstance.show();
  }

  function searchTeachersToAdd(keyword) {
    clearTimeout(searchTimer);
    const resultsEl = document.getElementById("results-search-teacher");
    if (!keyword.trim()) {
      resultsEl.innerHTML = `<div class="text-center text-muted small py-3">Gõ để tìm kiếm...</div>`;
      return;
    }
    resultsEl.innerHTML = `<div class="text-center text-muted small py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tìm...</div>`;
    searchTimer = setTimeout(async () => {
      try {
        const res = await api.fetch(
          `/teachers?keyword=${encodeURIComponent(keyword.trim())}&status=active&limit=10`,
        );
        const list = res?.data || [];
        if (list.length === 0) {
          resultsEl.innerHTML = `<div class="text-center text-danger small py-3">Không tìm thấy!</div>`;
          return;
        }

        resultsEl.innerHTML = list
          .map((t) => {
            const isSelected = selectedTeachersMap.has(t.id);
            const bgClass = isSelected
              ? "bg-danger bg-opacity-10 border border-danger"
              : "bg-white border hover-bg-light";
            return `
          <div id="search-gv-${t.id}" class="search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer ${bgClass}" onclick='window.classDetailManager.selectTeacherToAdd(${JSON.stringify(t).replace(/'/g, "&apos;")})'>
            <div>
              <div class="fw-semibold small text-dark">${esc(t.fullName)}</div>
              <div class="text-muted" style="font-size:11px;">Mã GV: ${esc(t.teacherCode || t.teacher_code)}</div>
            </div>
          </div>`;
          })
          .join("");
      } catch (err) {
        resultsEl.innerHTML = `<div class="text-center text-danger small py-3">Lỗi kết nối.</div>`;
      }
    }, 400);
  }

  function selectTeacherToAdd(teacher) {
    if (selectedTeachersMap.has(teacher.id))
      return showErr("Giáo viên này đã được chọn!");
    teacher.selectedRole = "MAIN";
    selectedTeachersMap.set(teacher.id, teacher);
    renderSelectedTeachers();
    const searchItem = document.getElementById(`search-gv-${teacher.id}`);
    if (searchItem)
      searchItem.className =
        "search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer bg-danger bg-opacity-10 border border-danger";
  }

  function removeTeacherToAdd(id) {
    selectedTeachersMap.delete(id);
    renderSelectedTeachers();
    const searchItem = document.getElementById(`search-gv-${id}`);
    if (searchItem)
      searchItem.className =
        "search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer bg-white border hover-bg-light";
  }

  function updateTeacherRole(id, role) {
    if (selectedTeachersMap.has(id)) {
      const t = selectedTeachersMap.get(id);
      t.selectedRole = role;
      selectedTeachersMap.set(id, t);
    }
  }

  function renderSelectedTeachers() {
    const listEl = document.getElementById("list-selected-teachers");
    document.getElementById("count-selected-teachers").innerText =
      selectedTeachersMap.size;

    if (selectedTeachersMap.size === 0) {
      listEl.innerHTML = `<div class="text-center text-muted small mt-4">Chưa chọn</div>`;
      return;
    }

    let html = "";
    selectedTeachersMap.forEach((t, id) => {
      html += `
        <div class="d-flex flex-column p-2 mb-2 bg-white shadow-sm rounded" style="border: 1px solid #dee2e6; border-left: 4px solid #dc3545 !important;">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <div class="fw-bold small text-dark">${esc(t.fullName)}</div>
              <div class="text-muted" style="font-size:11px;">Mã GV: ${esc(t.teacherCode || t.teacher_code)}</div>
            </div>
            <button class="btn btn-sm btn-link text-danger p-0 m-0" onclick="window.classDetailManager.removeTeacherToAdd(${id})"><i class="fa-solid fa-xmark fs-5"></i></button>
          </div>
          <div class="mt-2 pt-2 border-top border-light d-flex align-items-center justify-content-between">
            <span class="text-muted small" style="font-size: 12px;">Phân công:</span>
            <select class="form-select form-select-sm border-danger border-opacity-50 text-danger fw-semibold cursor-pointer" style="width: 120px; font-size: 12px;" onchange="window.classDetailManager.updateTeacherRole(${id}, this.value)">
              <option value="MAIN" ${t.selectedRole === "MAIN" ? "selected" : ""}>Dạy chính</option>
              <option value="ASSISTANT" ${t.selectedRole === "ASSISTANT" ? "selected" : ""}>Trợ giảng</option>
            </select>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  async function submitAddTeachers() {
    if (selectedTeachersMap.size === 0)
      return showErr("Vui lòng chọn ít nhất 1 giáo viên!");
    const btn = document.getElementById("btn-submit-add-teachers");
    btn.disabled = true;
    try {
      const existingTeachers = originalTeachers.map((t) => ({
        teacherId: t.id || t.teacherId || t.teacher_id,
        role: t.role,
      }));
      const newTeachers = Array.from(selectedTeachersMap.values()).map((t) => ({
        teacherId: t.id,
        role: t.selectedRole,
      }));
      const mergedTeachersMap = new Map();
      existingTeachers.forEach((t) => mergedTeachersMap.set(t.teacherId, t));
      newTeachers.forEach((t) => mergedTeachersMap.set(t.teacherId, t));
      const finalTeachersPayload = Array.from(mergedTeachersMap.values());

      const res = await api.fetch(`/classes/${classId}/link-teachers`, {
        method: "POST",
        body: JSON.stringify({ teacherIds: finalTeachersPayload }),
      });
      if (res && res.error) throw new Error(res.message);

      showSuccess(res?.message || "Cập nhật giáo viên thành công!");
      addTeacherModalInstance.hide();

      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        originalTeachers = res.data.map((t) => ({
          id: t.teacher_id || t.id,
          teacherCode: t.teacher_code || t.teacherCode,
          fullName: t.full_name || t.fullName,
          phone: t.phone,
          email: t.email,
          role: t.role,
          assignedAt: t.assigned_at,
        }));
        filterClassTeachers();
      } else {
        loadClassTeachers(true);
      }
    } catch (err) {
      showErr(err);
    } finally {
      btn.disabled = false;
    }
  }

  function openAddCourseModal() {
    const el = document.getElementById("addCourseModal");
    if (!el) return;
    addCourseModalInstance ??= new bootstrap.Modal(el);
    selectedCoursesMap.clear();
    document.getElementById("input-search-course-add").value = "";
    document.getElementById("results-search-course").innerHTML =
      `<div class="text-center text-muted small py-3">Gõ để tìm kiếm...</div>`;
    renderSelectedCourses();
    addCourseModalInstance.show();
  }
  function searchCoursesToAdd(keyword) {
    clearTimeout(searchTimer);
    const Battle = document.getElementById("results-search-course");
    if (!keyword.trim()) {
      Battle.innerHTML = `<div class="text-center text-muted small py-3">Gõ để tìm kiếm...</div>`;
      return;
    }
    Battle.innerHTML = `<div class="text-center text-muted small py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tìm...</div>`;
    searchTimer = setTimeout(async () => {
      try {
        const res = await api.fetch(
          `/courses?keyword=${encodeURIComponent(keyword.trim())}&status=upcoming&limit=10`,
        );
        const list = res?.data?.items || res?.data || [];
        if (list.length === 0) {
          Battle.innerHTML = `<div class="text-center text-danger small py-3">Không tìm thấy!</div>`;
          return;
        }
        Battle.innerHTML = list
          .map((c) => {
            const isSelected = selectedCoursesMap.has(c.id);
            const bgClass = isSelected
              ? "bg-danger bg-opacity-10 border border-danger"
              : "bg-white border hover-bg-light";
            return `
          <div id="search-co-${c.id}" class="search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer ${bgClass}" onclick='window.classDetailManager.selectCourseToAdd(${JSON.stringify(c).replace(/'/g, "&apos;")})'>
            <div><div class="fw-semibold small text-dark">${esc(c.courseName || c.course_name)}</div></div>
          </div>`;
          })
          .join("");
      } catch (err) {
        Battle.innerHTML = `<div class="text-center text-danger small py-3">Lỗi kết nối.</div>`;
      }
    }, 400);
  }
  function selectCourseToAdd(course) {
    selectedCoursesMap.set(course.id, course);
    renderSelectedCourses();
    const searchItem = document.getElementById(`search-co-${course.id}`);
    if (searchItem)
      searchItem.className =
        "search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer bg-danger bg-opacity-10 border border-danger";
  }
  function removeCourseToAdd(id) {
    selectedCoursesMap.delete(id);
    renderSelectedCourses();
    const searchItem = document.getElementById(`search-co-${id}`);
    if (searchItem)
      searchItem.className =
        "search-result-item d-flex align-items-center justify-content-between p-2 mb-2 rounded cursor-pointer bg-white border hover-bg-light";
  }
  function renderSelectedCourses() {
    const listEl = document.getElementById("list-selected-courses");
    document.getElementById("count-selected-courses").innerText =
      selectedCoursesMap.size;
    if (selectedCoursesMap.size === 0) {
      listEl.innerHTML = `<div class="text-center text-muted small mt-4">Chưa chọn</div>`;
      return;
    }
    let html = "";
    selectedCoursesMap.forEach((c, id) => {
      html += `
        <div class="d-flex align-items-center justify-content-between p-2 mb-2 bg-white shadow-sm rounded" style="border: 1px solid #dee2e6; border-left: 4px solid #dc3545 !important;">
          <div style="flex: 1;"><div class="fw-bold small text-dark mb-1">${esc(c.courseName || c.course_name)}</div></div>
          <button class="btn btn-sm btn-link text-danger p-0 m-0 ms-2" onclick="window.classDetailManager.removeCourseToAdd(${id})"><i class="fa-solid fa-xmark fs-5"></i></button>
        </div>`;
    });
    listEl.innerHTML = html;
  }
  async function submitAddCourses() {
    if (selectedCoursesMap.size === 0)
      return showErr("Vui lòng chọn ít nhất 1 khóa học!");
    const btn = document.getElementById("btn-submit-add-courses");
    btn.disabled = true;
    try {
      const existingCourses = originalCourses.map(
        (c) => c.id || c.courseId || c.course_id,
      );
      const newCourses = Array.from(selectedCoursesMap.values()).map(
        (c) => c.id,
      );
      const mergedCoursesSet = new Set([...existingCourses, ...newCourses]);
      const finalCoursesPayload = Array.from(mergedCoursesSet);
      const res = await api.fetch(`/classes/${classId}`, {
        method: "PUT",
        body: JSON.stringify({ courseIds: finalCoursesPayload }),
      });
      if (res && res.error) throw new Error(res.message);
      showSuccess(res?.message || "Cập nhật khóa học thành công!");
      addCourseModalInstance.hide();
      refreshCoursesTab(true);
    } catch (err) {
      showErr(err);
    } finally {
      btn.disabled = false;
    }
  }

  // =========================================================================
  // 7. XUẤT EXCEL CHO HỌC SINH
  // =========================================================================
  function loadXLSXLibrary() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Không tải được thư viện xuất Excel, kiểm tra mạng!"));
      document.head.appendChild(script);
    });
  }

  async function fetchAllClassStudentsForExport() {
    const allStudents = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const res = await api.fetch(
        `/classes/${classId}/students?page=${page}&limit=${limit}&keyword=${encodeURIComponent(stKeyword)}&status=${stStatus}`,
      );
      if (res?.message && !res?.data) throw new Error(res.message);
      if (!res?.data || !res?.data?.items)
        throw new Error(res?.message || "Không lấy được danh sách học sinh");
      allStudents.push(...res.data.items);
      const pagination = res.pagination;
      if (!pagination || page >= pagination.totalPages) break;
      page += 1;
    }
    return allStudents;
  }

  async function exportClassStudents() {
    const btn = document.getElementById("btn-export-students");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xuất...`;
    }

    try {
      await loadXLSXLibrary();
      const students = await fetchAllClassStudentsForExport();
      if (students.length === 0)
        return showErr("Không có học sinh nào để xuất!");

      const rows = students.map((s, idx) => {
        const discountPercent = parseFloat(s.discount_percent || 0);
        const originalFee = Number(s.original_fee || 0);
        const finalFee = Number(s.final_fee || 0);
        return {
          STT: idx + 1,
          "Mã HS": s.student_code,
          "Họ Tên": s.full_name,
          "Số điện thoại": s.phone || "",
          Email: s.email || "",
          "Học phí gốc": originalFee,
          "Học phí thực tế": finalFee,
          "Giảm giá (%)": discountPercent,
          "Ghi chú giảm giá": s.note || "",
          "Trạng thái":
            (s.status || "").toUpperCase() === "INACTIVE"
              ? "Nghỉ học"
              : "Đang học",
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách học sinh");
      const classCode =
        document.getElementById("cd-class-code")?.textContent?.trim() ||
        classId;
      XLSX.writeFile(
        workbook,
        `DanhSachHocSinh_${classCode}.xlsx`.replace(/[\\/:*?"<>|]/g, "_"),
      );
      showSuccess("Xuất file Excel thành công!");
    } catch (err) {
      showErr("Danh sách học sinh trống");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-excel me-1"></i> Xuất Excel`;
      }
    }
  }

  function goBack() {
    const prevPage = localStorage.getItem("previousPage") || "classes.html";
    if (typeof window.loadSubPage === "function") window.loadSubPage(prevPage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initTabListener();
      loadClassDetail();
    });
  } else {
    initTabListener();
    loadClassDetail();
  }

  return {
    goBack,
    loadClassDetail,
    startClass,
    // Học sinh
    loadClassStudents,
    goToStPage,
    filterClassStudents,
    openAddStudentModal,
    searchStudentsToAdd,
    selectStudentToAdd,
    removeStudentToAdd,
    toggleStudentDiscount,
    updateStudentDiscountPercent,
    updateStudentDiscountNote,
    submitAddStudents,
    exportClassStudents,
    loadXLSXLibrary,
    fetchAllClassStudentsForExport,
    removeStudentFromClass,
    // Giáo viên
    filterClassTeachers,
    goToTcPage,
    openAddTeacherModal,
    searchTeachersToAdd,
    selectTeacherToAdd,
    removeTeacherToAdd,
    updateTeacherRole,
    submitAddTeachers,
    removeTeacherFromClass,
    loadClassTeachers,
    editTeacherInClass,
    // Khóa học
    filterClassCourses,
    goToCoPage,
    openAddCourseModal,
    searchCoursesToAdd,
    selectCourseToAdd,
    removeCourseToAdd,
    submitAddCourses,
    removeCourseFromClass,
    refreshCoursesTab,
    // Lịch học
    openScheduleModal,
    saveSchedule,
    deleteSchedule,
    loadClassSchedules,
  };
})();
