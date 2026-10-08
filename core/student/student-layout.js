window.studentManager = (() => {
  // CẤU HÌNH BIẾN TOÀN CỤC & DOM
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0-11
  let currentStudentId = null;
  const user = typeof auth !== "undefined" ? auth.getUser() : null;

  const calendarContainer = document.getElementById("calendarDays");
  const monthYearText = document.getElementById("calendarMonthYear");
  const classDetail = document.getElementById("classDetail");
  const absenceSummary = document.getElementById("absenceSummary");

  // Tiện ích XSS
  const esc = (str) =>
    String(str ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );

  // =========================================================
  // 1. TẢI THÔNG TIN HỌC SINH HIỆN TẠI TỪ API
  // =========================================================
  async function loadCurrentStudent() {
    const tbody = document.getElementById("student-tbody");
    if (!tbody || !user) return;

    try {
      const studentId = user.id;

      const headerName = document.getElementById("headerStudentName");
      if (headerName)
        headerName.innerText = esc(user.fullName || user.username);

      const res = await api.fetch(`/students/user/${studentId}`);
      if (res && res.error) throw new Error(res.message);

      const student = res.data;
      if (!student) throw new Error("Dữ liệu trống");

      const studentCode = student.studentCode || student.student_code || "---";
      const fullName = student.fullName || student.full_name || "Chưa cập nhật";
      const actualStudentId = student.student_id || student.id || studentId;

      let classesHtml =
        '<span class="badge bg-light border text-dark fw-medium px-2 py-1">Chưa xếp lớp</span>';
      if (student.classes && student.classes.length > 0) {
        classesHtml = student.classes
          .map(
            (c) =>
              `<span class="badge bg-light border text-dark fw-medium px-2 py-1 me-1 mb-1">${esc(c.class_name || c.className)}</span>`,
          )
          .join("");
      }

      const isActive = student.status === "active";
      const statusClass = isActive
        ? "bg-success text-success border-success-subtle"
        : "bg-danger text-danger border-danger-subtle";
      const statusText = isActive ? "Đang học" : "Đã nghỉ";

      tbody.innerHTML = `
        <tr>
            <td class="py-3">
                <span class="badge bg-light text-dark border px-2 py-1 fw-semibold">${esc(studentCode)}</span>
            </td>
            <td class="py-3 fw-bold text-dark">${esc(fullName)}</td>
            <td class="py-3" style="max-width: 200px; flex-wrap: wrap;">
                ${classesHtml}
            </td>
            <td class="py-3"><span class="badge bg-opacity-10 border px-2 py-1 ${statusClass}">${statusText}</span></td>
            <td class="py-3 text-end pe-4">
                <button class="btn btn-outline-danger btn-sm rounded-1 px-3 fw-medium btn-view-progress" data-id="${actualStudentId}" data-name="${esc(fullName)}">
                    <i class="fa-solid fa-chart-line me-1"></i> Xem tiến độ
                </button>
            </td>
        </tr>
      `;

      const btn = tbody.querySelector(".btn-view-progress");
      if (btn) {
        btn.addEventListener("click", function () {
          const id = this.getAttribute("data-id");
          const name = this.getAttribute("data-name");
          viewProgress(id, name);
        });
        btn.click(); // Tự động click để hiển thị lịch của học sinh này luôn
      }
    } catch (error) {
      console.error(error);
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối máy chủ!</td></tr>`;
    }
  }

  // =========================================================
  // 2. LOGIC LỊCH HỌC VÀ ĐIỂM DANH
  // =========================================================

  // Hàm phụ trợ: Hiển thị nhãn trạng thái điểm danh
  function getAttendanceBadge(attStatus, sessionStatus) {
    if (sessionStatus === "cancelled") {
      return `<span class="badge bg-secondary"><i class="fa-solid fa-ban me-1"></i> Lớp nghỉ</span>`;
    }
    if (!attStatus || attStatus === "scheduled") {
      return `<span class="badge bg-light text-secondary border"><i class="fa-regular fa-circle text-muted me-1"></i> Chưa Đ.danh</span>`;
    }

    switch (attStatus) {
      case "PRESENT":
        return `<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i> Có mặt</span>`;
      case "ABSENT":
        return `<span class="badge bg-danger"><i class="fa-solid fa-xmark me-1"></i> Vắng mặt</span>`;
      case "LATE":
        return `<span class="badge bg-warning text-dark"><i class="fa-regular fa-clock me-1"></i> Đi muộn</span>`;
      case "EXCUSED":
        return `<span class="badge bg-info text-white"><i class="fa-solid fa-envelope-open-text me-1"></i> Có phép</span>`;
      default:
        return `<span class="badge bg-light text-secondary border"><i class="fa-regular fa-circle text-muted me-1"></i> Chưa Đ.danh</span>`;
    }
  }

  async function fetchStudentScheduleFromServer(studentId, year, month) {
    try {
      const resData = await api.fetch(
        `/students/${studentId}/schedules?year=${year}&month=${month + 1}`,
      );
      const apiList = resData.data || resData || [];

      let mappedSchedule = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (Array.isArray(apiList)) {
        apiList.forEach((item) => {
          if (!item.date) return;
          if (!mappedSchedule[item.date]) mappedSchedule[item.date] = [];

          // ĐÃ SỬA: Map chuẩn biến camelCase từ payload mới
          const startStr = (item.startTime || "00:00").substring(0, 5);
          const endStr = (item.endTime || "00:00").substring(0, 5);

          const classDate = new Date(item.date);
          const calculatedStatus = classDate < today ? "past" : "future";

          mappedSchedule[item.date].push({
            status: calculatedStatus,
            session: item.sessionNumber || 1,
            subject: item.className || "Chưa cập nhật",
            code: item.classCode || "",
            shift: item.shiftName || "Ca học",
            time: `${startStr} - ${endStr}`,
            sessionStatus: item.sessionStatus, // done, scheduled, cancelled
            attendanceStatus: item.displayStatus || item.attendanceStatus,
          });
        });
      }
      return mappedSchedule;
    } catch (error) {
      console.error("Lỗi lấy lịch học:", error);
      return {};
    }
  }

  async function renderDynamicCalendar(year, month, studentId) {
    if (!calendarContainer || !monthYearText) return;

    calendarContainer.innerHTML = "";
    monthYearText.innerText = `Tháng ${month + 1}, ${year}`;

    let firstDayIndex = new Date(year, month, 1).getDay();
    let startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    let totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const studentSchedule = await fetchStudentScheduleFromServer(
      studentId,
      year,
      month,
    );

    for (let x = 0; x < startOffset; x++) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "cal-day empty";
      calendarContainer.appendChild(emptyDiv);
    }

    const now = new Date();

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "cal-day";
      dayDiv.innerHTML = `${day}`;

      const formattedMonth = String(month + 1).padStart(2, "0");
      const formattedDay = String(day).padStart(2, "0");
      const dateKey = `${year}-${formattedMonth}-${formattedDay}`;

      if (studentSchedule[dateKey] && studentSchedule[dateKey].length > 0) {
        const classesToday = studentSchedule[dateKey];
        const hasFutureClass = classesToday.some((c) => c.status === "future");

        if (hasFutureClass) {
          dayDiv.classList.add("has-class");
          dayDiv.innerHTML += `<span class="dot"></span>`;
        } else {
          dayDiv.classList.add("attended");
        }

        dayDiv.addEventListener("click", () => {
          highlightSelectedDay(dayDiv);
          if (classDetail) {
            classDetail.classList.remove("justify-content-center");

            const classesHtml = classesToday
              .map((info) => {
                const isCancelled = info.sessionStatus === "cancelled";
                const isDone =
                  info.sessionStatus === "done" || info.status === "past";

                return `
              <div class="bg-light bg-opacity-50 rounded-3 p-3 border border-light-subtle mb-3">
                  <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
                      <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle px-2 py-1">Buổi ${info.session}</span>
                      <span class="badge bg-secondary bg-opacity-10 text-secondary border px-2 py-1">${esc(info.shift)}</span>
                  </div>
                  <div class="row g-2 mt-1">
                      <div class="col-12 border-bottom pb-2 mb-1">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Khóa / Môn học</p>
                          <p class="fw-bold text-dark mb-0 fs-6">${esc(info.subject)} <span class="text-muted fw-normal small">(${esc(info.code)})</span></p>
                      </div>
                      <div class="col-sm-4 border-end">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Thời gian</p>
                          <p class="fw-medium text-dark mb-0"><i class="fa-regular fa-clock me-1 text-secondary"></i> ${esc(info.time)}</p>
                      </div>
                      <div class="col-sm-4 border-end px-sm-2">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Trạng thái lớp</p>
                          <p class="mb-0 mt-1" style="font-size: 0.9rem;">
                              ${
                                isCancelled
                                  ? '<span class="text-danger fw-bold"><i class="fa-solid fa-ban me-1"></i> Nghỉ học</span>'
                                  : isDone
                                    ? '<span class="text-success fw-bold"><i class="fa-solid fa-check-circle me-1"></i> Đã diễn ra</span>'
                                    : '<span class="text-secondary fw-medium"><i class="fa-regular fa-hourglass-half me-1"></i> Chưa diễn ra</span>'
                              }
                          </p>
                      </div>
                      <div class="col-sm-4 px-sm-2">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Điểm danh</p>
                          <p class="mb-0 mt-1">
                              ${getAttendanceBadge(info.attendanceStatus, info.sessionStatus)}
                          </p>
                      </div>
                  </div>
              </div>
            `;
              })
              .join("");

            // Cấu trúc chống đẩy chiều cao (scrollable)
            classDetail.innerHTML = `
                <div class="d-flex flex-column h-100 w-100 animate__animated animate__fadeIn">
                    <h5 class="fw-bold text-dark mb-3 border-bottom pb-2 flex-shrink-0">
                        <i class="fa-regular fa-calendar-check text-danger me-2"></i>Chi tiết ngày ${formattedDay}/${formattedMonth}/${year}
                    </h5>
                    <div class="flex-grow-1 position-relative w-100">
                        <div class="position-absolute top-0 start-0 w-100 h-100 overflow-auto pe-2 custom-scrollbar">
                            ${classesHtml}
                        </div>
                    </div>
                </div>
            `;
          }
        });
      } else {
        dayDiv.addEventListener("click", () => {
          highlightSelectedDay(dayDiv);
          if (classDetail) {
            classDetail.classList.add("justify-content-center");
            classDetail.innerHTML = `
                <div class="text-center text-muted m-auto animate__animated animate__fadeIn">
                    <i class="fa-regular fa-calendar-xmark text-secondary opacity-25 mb-3" style="font-size: 3.5rem;"></i>
                    <h6 class="fw-bold text-dark mb-1">Ngày ${formattedDay}/${formattedMonth}/${year}</h6>
                    <p class="small mb-0">Không có ca học nào được xếp vào ngày này.</p>
                </div>
            `;
          }
        });
      }

      calendarContainer.appendChild(dayDiv);

      // Tự động click vào hôm nay
      if (
        year === now.getFullYear() &&
        month === now.getMonth() &&
        day === now.getDate()
      ) {
        dayDiv.click();
      }
    }

    if (absenceSummary) {
      absenceSummary.innerText = "Chưa có dữ liệu";
    }
  }

  function highlightSelectedDay(element) {
    document
      .querySelectorAll(".cal-day")
      .forEach((el) => el.classList.remove("active-day"));
    element.classList.add("active-day");
  }

  // =========================================================
  // 3. ĐIỀU HƯỚNG
  // =========================================================
  async function viewProgress(studentId, studentName) {
    currentStudentId = studentId;
    currentYear = new Date().getFullYear();
    currentMonth = new Date().getMonth();

    const nameEl = document.getElementById("progressStudentName");
    const sectionEl = document.getElementById("progressSection");

    if (nameEl) nameEl.innerText = studentName;
    if (sectionEl) sectionEl.classList.remove("d-none");

    if (classDetail) {
      classDetail.classList.add("justify-content-center");
      classDetail.innerHTML = `<div class="spinner-border text-danger m-auto" role="status"></div>`;
    }

    await renderDynamicCalendar(currentYear, currentMonth, currentStudentId);
  }

  async function changeMonth(offset) {
    if (!currentStudentId) return;
    currentMonth += offset;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    await renderDynamicCalendar(currentYear, currentMonth, currentStudentId);
  }

  // Khởi tạo
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof auth !== "undefined" && !auth.checkAccess("HS")) return;

    loadCurrentStudent();

    document
      .getElementById("prevMonthBtn")
      ?.addEventListener("click", () => changeMonth(-1));
    document
      .getElementById("nextMonthBtn")
      ?.addEventListener("click", () => changeMonth(1));

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const isConfirmed = await (typeof utils !== "undefined"
          ? utils.confirm("Bạn muốn đăng xuất?", {
              title: "Đăng xuất",
              type: "warning",
            })
          : Promise.resolve(confirm("Đăng xuất?")));
        if (isConfirmed) {
          typeof auth !== "undefined"
            ? auth.logout()
            : (localStorage.clear(), (window.location.href = "/login.html"));
        }
      });
    }
  });

  return { viewProgress };
})();
