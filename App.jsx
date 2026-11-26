import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  translations,
  translateLockerName,
  translateLockerLocation,
  translateEntryLabel,
  translateCameraSource,
  translateDeviceDesc
} from "./translations";
import {
  Activity, Archive, CalendarDays, Camera, CheckCircle2, ChevronRight, Cpu,
  DoorOpen, FileSpreadsheet, History, LayoutDashboard, Menu, Package,
  Plus, ShieldCheck, Users, Video, X, Lock, LockOpen, Clock3, ClipboardList,
  ArrowDownToLine, ArrowUpFromLine, AlertCircle, Search, Filter, Download,
  UserCheck, LogIn, LogOut, RefreshCw, Trash2, Edit, Play, Square, VideoOff,
  ChevronDown, ChevronUp, Layers, Box, Clock, Calendar, RotateCcw, Check
} from "lucide-react";
import { api } from "./api.js";
import { INITIAL_EQUIPMENT_DATA } from "./equipmentData.js";
import WeeklySchedule from "./WeeklySchedule";

const sessionInfo = {
  morning: {
    label: "Buổi sáng",
    labelEn: "Morning",
    periods: 5,
    times: ["07:00–07:45", "07:50–08:35", "08:40–09:25", "09:40–10:25", "10:30–11:15"]
  },
  afternoon: {
    label: "Buổi chiều",
    labelEn: "Afternoon",
    periods: 3,
    times: ["13:00–13:45", "13:50–14:35", "14:40–15:25"]
  }
};

const navItems = [
  ["Tổng quan", "dashboard", LayoutDashboard, ["admin", "principal", "manager", "teacher", "student", "guest"]],
  ["Đăng ký lịch", "booking", CalendarDays, ["admin", "manager", "teacher", "student", "guest"]],
  ["Quản lý đăng ký", "manage", ClipboardList, ["admin", "manager"]],
  ["Giám sát hộc tủ", "lockers", Archive, ["admin", "manager", "teacher"]],
  ["Lịch sử hộc tủ", "locker-history", History, ["admin", "principal", "manager"]],
  ["Camera tổng quan", "camera", Camera, ["admin", "principal", "manager"]],
  ["Báo cáo ra/vào", "entry-report", Users, ["admin", "principal", "manager"]],
  ["Thiết bị STEM", "devices", Package, ["admin", "manager", "teacher", "student"]],
  ["Báo cáo thống kê", "reports", FileSpreadsheet, ["admin", "principal", "manager"]]
];

function canAccessPage(pageKey, role) {
  const item = navItems.find((x) => x[1] === pageKey);
  return item ? item[3].includes(role) : false;
}

const DEFAULT_LOCKERS = [
  { id: "L01", name: "Hộc tủ 01", location: "Khu thiết bị điện tử & đo lường", state: "closed", updatedAt: "--:--" },
  { id: "L02", name: "Hộc tủ 02", location: "Khu dụng cụ chế tạo cơ bản", state: "open", updatedAt: "--:--" },
  { id: "L03", name: "Hộc tủ 03", location: "Khu cảm biến & linh kiện", state: "closed", updatedAt: "--:--" },
  { id: "L04", name: "Hộc tủ 04", location: "Khu vi điều khiển Arduino / ESP32", state: "closed", updatedAt: "--:--" },
  { id: "L05", name: "Hộc tủ 05", location: "Khu máy in 3D & dụng cụ in", state: "closed", updatedAt: "--:--" },
  { id: "L06", name: "Hộc tủ 06", location: "Khu vật tư tiêu hao & Robot", state: "closed", updatedAt: "--:--" }
];

const mockUsers = [
  { id: 1, username: "admin", name: "Trần Hà Anh", role: "admin", department: "Quản trị hệ thống", departmentEn: "System Administration" },
  { id: 2, username: "bangiamhieu", name: "Cô Phạm Thị Thuận", role: "principal", department: "Hiệu Trưởng", departmentEn: "Principal" },
  { id: 3, username: "giaovien", name: "Cô Trần Thị Lan", role: "teacher", department: "Giáo viên Tin học - STEM", departmentEn: "Computer Science & STEM Teacher" },
  { id: 4, username: "quanli", name: "Mai Hồng Loan", role: "manager", department: "Quản lí Phòng STEM", departmentEn: "STEM Lab Manager" },
  { id: 5, username: "hocsinh", name: "Trần Hà Anh", role: "student", department: "Lớp 11 Tin", departmentEn: "Class 11 CS" },
  { id: 6, username: "khach", name: "Bông", role: "guest", department: "Khách tham quan", departmentEn: "Visitor / Guest" }
];

export default function App() {
  const [lang, setLang] = useState("vi"); // "vi" | "en"
  const t = translations[lang] || translations.vi;
  const isEn = lang === "en";

  const [page, setPage] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");

  // User Auth State
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("stem-current-user");
      return saved ? JSON.parse(saved) : mockUsers[0];
    } catch {
      return mockUsers[0];
    }
  });
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Core Data States
  const [bookings, setBookings] = useState([]);
  const [lockers, setLockers] = useState(DEFAULT_LOCKERS);
  const [lockerLogs, setLockerLogs] = useState([]);
  const [entryLogs, setEntryLogs] = useState([]);
  const [devices, setDevices] = useState(() => {
    try {
      const saved = localStorage.getItem("stem-equipment-v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 100) return parsed;
      }
    } catch (e) {}
    return INITIAL_EQUIPMENT_DATA;
  });
  const [backendOnline, setBackendOnline] = useState(true);

  // Sync devices to localStorage
  useEffect(() => {
    if (devices && devices.length > 0) {
      try {
        localStorage.setItem("stem-equipment-v2", JSON.stringify(devices));
      } catch (e) {}
    }
  }, [devices]);

  // Load all data on mount and refresh
  async function loadData() {
    try {
      const [bRes, lRes, llRes, eRes, dRes] = await Promise.allSettled([
        api.getBookings(),
        api.getLockers(),
        api.getLockerLogs(),
        api.getEntryLogs(),
        api.getDevices()
      ]);

      if (bRes.status === "fulfilled" && bRes.value.bookings) {
        setBookings(bRes.value.bookings);
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
      if (lRes.status === "fulfilled" && lRes.value.lockers) setLockers(lRes.value.lockers);
      if (llRes.status === "fulfilled" && llRes.value.logs) setLockerLogs(llRes.value.logs);
      if (eRes.status === "fulfilled" && eRes.value.logs) setEntryLogs(eRes.value.logs);
      if (dRes.status === "fulfilled" && dRes.value.devices && dRes.value.devices.length >= 100) {
        setDevices(dRes.value.devices);
      }
    } catch (err) {
      console.warn("Backend offline, using local fallback:", err);
      setBackendOnline(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Polling for sync
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem("stem-current-user", JSON.stringify(currentUser));
    if (!canAccessPage(page, currentUser.role)) {
      setPage("dashboard");
    }
  }, [currentUser, page]);

  function notify(msg, type = "success") {
    setNotice(msg);
    setNoticeType(type);
    setTimeout(() => setNotice(""), 6000);
  }

  // --- Handlers ---
async function handleAddBooking(form) {
  try {
    const res = await api.createBooking(form);

    if (!res.success || !res.booking) {
      notify(
        res.message || (isEn ? "Unable to submit booking." : "Không thể đăng ký lịch."),
        "error"
      );
      return false;
    }

    setBookings(prev => [
      res.booking,
      ...prev.filter(b => b.id !== res.booking.id)
    ]);

    notify(t.schedule.successAlert);

    return true;

  } catch (err) {
    console.error("Add booking error:", err);

    notify(
      err.message || (isEn ? "Room booking error" : "Lỗi đăng ký lịch phòng"),
      "error"
    );

    return false;
  }
}

 async function handleUpdateBookingStatus(id, status) {
  try {
    const res = await api.updateBookingStatus(id, status);

    if (!res.success) {
      notify(
        res.message || (isEn ? "Unable to update booking status." : "Không thể cập nhật trạng thái lịch."),
        "error"
      );
      return false;
    }

    setBookings(prev =>
      prev.map(b =>
        String(b.id) === String(id)
          ? { ...b, status }
          : b
      )
    );

    const statusLabel = t.statuses[status] || status;

    notify(
      isEn
        ? `Updated booking status to: ${statusLabel}`
        : `Đã cập nhật trạng thái đăng ký thành: ${statusLabel}`
    );

    return true;

  } catch (err) {
    console.error("Update booking error:", err);
    notify(err.message || (isEn ? "Error updating booking status" : "Lỗi duyệt lịch"), "error");
    return false;
  }
}
  async function handleDeleteBooking(id) {
    const confirmMsg = isEn ? "Are you sure you want to delete this booking?" : "Bạn có chắc chắn muốn xóa lượt đăng ký này?";
    if (!window.confirm(confirmMsg)) return;
    try {
      await api.deleteBooking(id);
      setBookings(prev => prev.filter(b => b.id !== id));
      notify(isEn ? "Booking request deleted" : "Đã xóa lượt đăng ký");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleToggleLocker(id) {
    const target = lockers.find(l => l.id === id);
    if (!target) return;
    const nextState = target.state === "open" ? "closed" : "open";
    try {
      const res = await api.updateLocker(id, nextState, isEn ? "UI Simulation" : "Mô phỏng giao diện");
      if (res.success) {
        setLockers(prev => prev.map(l => l.id === id ? res.locker : l));
        const actionStr = nextState === "open" ? (isEn ? "OPENED" : "MỞ") : (isEn ? "CLOSED" : "ĐÓNG");
        notify(isEn ? `${target.name} is now ${actionStr} (Saved to SQLite)` : `Đã ${actionStr} ${target.name} (Đã ghi vào cơ sở dữ liệu SQLite)`);
        // Refresh logs
        const lRes = await api.getLockerLogs();
        if (lRes.logs) setLockerLogs(lRes.logs);
      }
    } catch (err) {
      notify(isEn ? "Error updating locker state" : "Lỗi cập nhật trạng thái hộc tủ", "error");
    }
  }

  async function handleAddEntryLog(direction, label, count = 1) {
    try {
      const res = await api.createEntryLog({ direction, label, count, camera: isEn ? "STEM Room AI Camera" : "Camera AI phòng STEM" });
      if (res.success) {
        setEntryLogs(prev => [res.log, ...prev]);
        notify(isEn ? `Recorded event: ${label} (${count} people)` : `Đã ghi nhận sự kiện: ${label} (${count} người)`);
      }
    } catch (err) {
      notify(isEn ? "Error recording camera event" : "Lỗi ghi nhận sự kiện camera", "error");
    }
  }

  // Devices handlers
  async function handleAddDevice(dev) {
    try {
      const res = await api.createDevice(dev);
      if (res.success) {
        setDevices(prev => [...prev, res.device]);
        notify(isEn ? `Added new equipment: ${res.device.name}` : `Đã thêm thiết bị mới: ${res.device.name}`);
        return true;
      }
    } catch (err) {
      notify(err.message, "error");
      return false;
    }
  }

  async function handleUpdateDevice(id, data) {
    try {
      const res = await api.updateDevice(id, data);
      if (res.success) {
        setDevices(prev => prev.map(d => d.id === id ? res.device : d));
        notify(isEn ? "Updated equipment info" : "Đã cập nhật thông tin thiết bị");
        return true;
      }
    } catch (err) {
      notify(err.message, "error");
      return false;
    }
  }

  async function handleDeleteDevice(id) {
    const confirmMsg = isEn ? "Are you sure you want to delete this equipment from the system?" : "Bạn có chắc chắn muốn xóa thiết bị này khỏi hệ thống?";
    if (!window.confirm(confirmMsg)) return;
    try {
      await api.deleteDevice(id);
      setDevices(prev => prev.filter(d => d.id !== id));
      notify(isEn ? "Equipment removed from inventory" : "Đã xóa thiết bị khỏi danh mục");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleBorrowDevice(id, borrowData) {
    try {
      const borrowerName = typeof borrowData === "string" ? borrowData : (borrowData?.borrower || "");
      const borrowerClass = typeof borrowData === "object" ? (borrowData.borrowerClass || "") : "";
      const borrowerPhone = typeof borrowData === "object" ? (borrowData.borrowerPhone || "") : "";
      const borrowQty = typeof borrowData === "object" ? (Number(borrowData.quantity) || 1) : 1;
      const borrowTime = typeof borrowData === "object" && borrowData.borrowTime ? borrowData.borrowTime : new Date().toISOString();
      const expectedReturnTime = typeof borrowData === "object" && borrowData.expectedReturnTime ? borrowData.expectedReturnTime : null;
      const notes = typeof borrowData === "object" ? (borrowData.notes || "") : "";

      try {
        await api.borrowDevice(id, borrowerName);
      } catch (err) {
        // Fallback gracefully
      }

      setDevices(prev => prev.map(d => {
        if (d.id === id) {
          const newAvail = Math.max(0, (d.available != null ? d.available : d.quantity) - borrowQty);
          const historyEntry = {
            id: Date.now(),
            deviceId: d.id,
            deviceCode: d.code,
            deviceName: d.name,
            deviceNameEn: d.nameEn,
            borrower: borrowerName,
            borrowerClass,
            borrowerPhone,
            quantity: borrowQty,
            unit: d.unit,
            unitEn: d.unitEn,
            locker_id: d.locker_id,
            borrowTime,
            expectedReturnTime,
            notes,
            status: "Đang mượn"
          };
          const updatedHist = [historyEntry, ...(d.borrowHistory || [])];
          return {
            ...d,
            available: newAvail,
            status: newAvail === 0 ? "Đang mượn" : d.status,
            borrower: borrowerName,
            borrowerClass,
            borrowerPhone,
            borrowTime,
            expectedReturnTime,
            borrowHistory: updatedHist
          };
        }
        return d;
      }));

      notify(isEn ? `Lent equipment to ${borrowerName}` : `Đã cho mượn thiết bị cho ${borrowerName}`);
      return true;
    } catch (err) {
      notify(err.message, "error");
      return false;
    }
  }

  async function handleReturnDevice(id, returnData = {}) {
    try {
      try {
        await api.returnDevice(id);
      } catch (err) {
        // Fallback gracefully
      }

      const actualReturnTime = returnData?.actualReturnTime || new Date().toISOString();

      setDevices(prev => prev.map(d => {
        if (d.id === id) {
          const isOverdue = d.expectedReturnTime && new Date(actualReturnTime) > new Date(d.expectedReturnTime);
          const updatedHistory = (d.borrowHistory || []).map(h => {
            if (h.status === "Đang mượn") {
              return {
                ...h,
                actualReturnTime,
                status: isOverdue ? "Quá hạn" : "Đã hoàn trả",
                returnStatus: isOverdue ? "Trễ hạn" : "Đúng hạn"
              };
            }
            return h;
          });

          return {
            ...d,
            available: d.quantity,
            status: "Sẵn sàng",
            borrower: null,
            borrowerClass: null,
            borrowerPhone: null,
            borrowTime: null,
            expectedReturnTime: null,
            actualReturnTime,
            borrowHistory: updatedHistory
          };
        }
        return d;
      }));

      notify(isEn ? "Returned equipment to storage locker" : "Đã hoàn trả thiết bị vào kho hộc tủ");
      return true;
    } catch (err) {
      notify(err.message, "error");
      return false;
    }
  }

  const pending = useMemo(() => bookings.filter(b => b.status === "Chờ duyệt").length, [bookings]);
  const openLockers = lockers.filter(x => x.state === "open").length;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Cpu size={23} /></div>
          <div><strong>SMART STEM</strong><span>ROOM MANAGEMENT</span></div>
          <button className="close-nav" onClick={() => setMobileNav(false)}><X size={19}/></button>
        </div>
        <div className="side-label">{t.common.workspace}</div>
        <nav>
          {navItems.filter((item) => item[3].includes(currentUser.role)).map(([label, key, Icon]) => (
            <button key={key} className={`nav-item ${page === key ? "active" : ""}`}
              onClick={() => { setPage(key); setMobileNav(false); }}>
              <Icon size={18}/><span>{t.nav[key] || label}</span>
              {key === "manage" && pending > 0 && <b className="nav-count">{pending}</b>}
              {key === "lockers" && openLockers > 0 && <b className="nav-count">{openLockers}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-mini" onClick={() => setShowAuthModal(true)} style={{ cursor: "pointer" }} title={isEn ? "Click to switch role" : "Nhấn để đổi vai trò"}>
            <div className="avatar">{currentUser.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <b>{currentUser.name}</b>
              <span>{t.roles[currentUser.role] || currentUser.role}</span>
            </div>
          </div>
          <div className="sidebar-note">
            {t.common.dbStatus} ({backendOnline ? t.common.connected : t.common.offline})<br/>
            {t.common.version}
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMobileNav(true)}><Menu/></button>
          <div className="breadcrumb">
            SMART STEM ROOM <ChevronRight size={14}/> <b>{t.nav[page] || navItems.find(x => x[1] === page)?.[0] || t.common.system}</b>
          </div>
          <div className="top-right">
            {/* Nút chuyển đổi ngôn ngữ */}
            <button
              onClick={() => setLang(lang === "vi" ? "en" : "vi")}
              className="user-selector-btn"
              style={{ fontWeight: "700", minWidth: "75px", justifyContent: "center" }}
              title={isEn ? "Switch Language" : "Chuyển đổi ngôn ngữ"}
            >
              {lang === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
            </button>

            <span className={backendOnline ? "online-dot" : "online-dot is-open"} style={backendOnline ? {} : { background: "#e55353" }}/>
            <span>{backendOnline ? t.common.serverConnected : t.common.serverDisconnected}</span>

            <button className="user-selector-btn" onClick={() => setShowAuthModal(true)}>
              <UserCheck size={14}/>
              <b>{currentUser.name}</b>
              <span className="user-badge-role">{t.roles[currentUser.role] || currentUser.role}</span>
            </button>
          </div>
        </header>

        <div className="content">
          {notice && (
            <div className="notice" style={noticeType === "error" ? { background: "#ffebee", color: "#c62828" } : {}}>
              <CheckCircle2 size={17}/>
              <span>{notice}</span>
              <button onClick={() => setNotice("")}><X size={16}/></button>
            </div>
          )}

          {page === "dashboard" && (
            <Dashboard
              bookings={bookings}
              pending={pending}
              lockers={lockers}
              entryLogs={entryLogs}
              devices={devices}
              backendOnline={backendOnline}
              currentUser={currentUser}
              onNavigate={(target) => {
                if (canAccessPage(target, currentUser.role)) setPage(target);
              }}
              lang={lang}
            />
          )}

          {page === "booking" && canAccessPage("booking", currentUser.role) && (
            <WeeklySchedule
              bookings={bookings}
              currentUser={currentUser}
              onAddBooking={handleAddBooking}
              lang={lang}
            />
          )}

          {page === "manage" && canAccessPage("manage", currentUser.role) && (
            <ManagePage
              bookings={bookings}
              currentUser={currentUser}
              onUpdate={handleUpdateBookingStatus}
              onDelete={handleDeleteBooking}
              lang={lang}
            />
          )}

          {page === "lockers" && canAccessPage("lockers", currentUser.role) && (
            <LockersPage
              lockers={lockers}
              onToggle={handleToggleLocker}
              lang={lang}
            />
          )}

          {page === "locker-history" && canAccessPage("locker-history", currentUser.role) && (
            <LockerHistoryPage logs={lockerLogs} lang={lang} />
          )}

          {page === "camera" && canAccessPage("camera", currentUser.role) && (
            <CameraPage onRecordEntry={handleAddEntryLog} lang={lang} />
          )}

          {page === "entry-report" && canAccessPage("entry-report", currentUser.role) && (
            <EntryReportPage logs={entryLogs} lang={lang} />
          )}

          {page === "devices" && canAccessPage("devices", currentUser.role) && (
            <DevicesPage
              devices={devices}
              lockers={lockers}
              currentUser={currentUser}
              onAdd={handleAddDevice}
              onUpdate={handleUpdateDevice}
              onDelete={handleDeleteDevice}
              onBorrow={handleBorrowDevice}
              onReturn={handleReturnDevice}
              lang={lang}
            />
          )}

          {page === "reports" && canAccessPage("reports", currentUser.role) && (
            <ReportsPage
              bookings={bookings}
              lockerLogs={lockerLogs}
              entryLogs={entryLogs}
              lockers={lockers}
              devices={devices}
              lang={lang}
            />
          )}
        </div>

        <footer>
          {t.common.footerText}
        </footer>
      </main>

      {/* Modal Đổi tài khoản / Vai trò */}
      {showAuthModal && (
        <AuthModal
          currentUser={currentUser}
          onSelectUser={(u) => {
            setCurrentUser(u);
            if (!canAccessPage(page, u.role)) {
              setPage("dashboard");
            }
            setShowAuthModal(false);
            const roleName = t.roles[u.role] || u.role;
            notify(isEn ? `Switched role to: ${u.name} (${roleName})` : `Đã chuyển sang vai trò: ${u.name} (${roleName})`);
          }}
          onClose={() => setShowAuthModal(false)}
          lang={lang}
        />
      )}
    </div>
  );
}

// ==========================================
// COMPONENT: PAGE HEADING & REUSABLE CARDS
// ==========================================
function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20}/></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}

// ==========================================
// PAGE: DASHBOARD
// ==========================================
function Dashboard({ bookings, pending, lockers, entryLogs, devices, backendOnline, currentUser, onNavigate, lang = "vi" }) {
  const t = translations[lang]?.dashboard || translations.vi.dashboard;
  const tc = translations[lang]?.common || translations.vi.common;
  const openCount = lockers.filter(x => x.state === "open").length;
  const readyDevices = devices.filter(d => d.status === "Sẵn sàng" && !d.borrower).length;
  const role = currentUser?.role || "guest";

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          canAccessPage("booking", role) && (
            <button className="primary-btn" onClick={() => onNavigate("booking")}>
              <Plus size={17}/> {t.bookBtn}
            </button>
          )
        }
      />

      <div className="welcome-banner">
        <div>
          <div className="welcome-tag">{t.bannerTag}</div>
          <h2>
            {t.bannerTitle.split("\n").map((line, i) => (
              <React.Fragment key={i}>
                {line}
                {i === 0 && <br/>}
              </React.Fragment>
            ))}
          </h2>
          <p>{t.bannerDesc}</p>
        </div>
        <div className="banner-art">
          <div className="orbit orbit-one"/>
          <div className="orbit orbit-two"/>
          <Cpu size={76}/>
        </div>
      </div>

      <div className="section-title">{t.sectionTitle}</div>
      <div className="stats-grid">
        <Stat icon={CalendarDays} label={t.statTotalBookings} value={bookings.length} hint={t.statTotalBookingsHint} tone="blue"/>
        <Stat icon={Clock3} label={t.statPending} value={pending} hint={t.statPendingHint} tone="orange"/>
        <Stat icon={Archive} label={t.statOpenLockers} value={openCount} hint={t.statOpenLockersHint} tone="green"/>
        <Stat icon={Package} label={t.statReadyDevices} value={readyDevices} hint={t.statReadyDevicesHint.replace("{total}", devices.length)} tone="purple"/>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>{t.lockersTitle}</h3>
              <p>{t.lockersDesc}</p>
            </div>
            {canAccessPage("lockers", role) && (
              <button className="text-btn" onClick={() => onNavigate("lockers")}>{t.viewAll}</button>
            )}
          </div>
          {lockers.slice(0, 5).map(x => (
            <div className="status-line" key={x.id}>
              <div className="status-icon"><Archive size={17}/></div>
              <span><b>{translateLockerName(x.name, lang)}</b> ({translateLockerLocation(x.location, lang)})</span>
              <b>
                <i className={x.state === "closed" ? "is-on" : "is-open"}/>
                {x.state === "closed" ? tc.closed : tc.open}
              </b>
            </div>
          ))}
          <div className="info-callout">
            {t.lockersCallout}
          </div>
        </section>

        <section className="panel system-panel">
          <div className="panel-head">
            <div>
              <h3>{t.hardwareTitle}</h3>
              <p>{t.hardwareDesc}</p>
            </div>
            <ShieldCheck size={20} className="muted"/>
          </div>

          <div className="status-line">
            <div className="status-icon"><Cpu size={17}/></div>
            <span>{t.serverBackend}</span>
            <b><i className={backendOnline ? "is-on" : ""}/> {backendOnline ? t.serverOnline : t.serverOffline}</b>
          </div>
          <div className="status-line">
            <div className="status-icon"><Archive size={17}/></div>
            <span>{t.esp32Module}</span>
            <b><i className="is-on"/> {t.esp32Ready}</b>
          </div>
          <div className="status-line">
            <div className="status-icon"><Camera size={17}/></div>
            <span>{t.cameraAi}</span>
            <b><i className="is-on"/> {t.cameraReady}</b>
          </div>
          <div className="status-line">
            <div className="status-icon"><FileSpreadsheet size={17}/></div>
            <span>{t.csvExport}</span>
            <b><i className="is-on"/> {t.csvReady}</b>
          </div>

          {(canAccessPage("devices", role) || canAccessPage("camera", role)) && (
            <div style={{ marginTop: "18px", display: "flex", gap: "8px" }}>
              {canAccessPage("devices", role) && (
                <button className="secondary-btn" style={{ flex: 1 }} onClick={() => onNavigate("devices")}>
                  <Package size={15}/> {t.btnDevices}
                </button>
              )}
              {canAccessPage("camera", role) && (
                <button className="secondary-btn" style={{ flex: 1 }} onClick={() => onNavigate("camera")}>
                  <Camera size={15}/> {t.btnCamera}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ==========================================
// PAGE: MANAGE BOOKINGS
// ==========================================
function ManagePage({ bookings, currentUser, onUpdate, onDelete, lang = "vi" }) {
  const t = translations[lang]?.manage || translations.vi.manage;
  const tc = translations[lang]?.common || translations.vi.common;
  const ts = translations[lang]?.statuses || translations.vi.statuses;
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      const matchStatus = filterStatus === "all" || b.status === filterStatus;
      const matchSearch = !searchTerm ||
        b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.class_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.purpose?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [bookings, filterStatus, searchTerm]);

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          <a href={api.getExportCsvUrl("bookings")} download className="secondary-btn" style={{ textDecoration: "none" }}>
            <Download size={15}/> {tc.exportCsv}
          </a>
        }
      />

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>{t.listTitle.replace("{count}", filtered.length)}</h3>
            <p>{t.listDesc}</p>
          </div>
          <div className="filter-bar" style={{ margin: 0 }}>
            <input
              className="search-input"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: "220px" }}
            />
            <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">{tc.allStatus}</option>
              <option value="Chờ duyệt">{ts["Chờ duyệt"] || "Chờ duyệt"}</option>
              <option value="Đã duyệt">{ts["Đã duyệt"] || "Đã duyệt"}</option>
              <option value="Từ chối">{ts["Từ chối"] || "Từ chối"}</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.colApplicant}</th>
                <th>{t.colDate}</th>
                <th>{t.colSessionPeriod}</th>
                <th>{t.colPurpose}</th>
                <th>{t.colStatus}</th>
                <th>{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td>
                    <b>{b.name}</b>
                    <small>{b.class_name}</small>
                  </td>
                  <td>{b.date}</td>
                  <td>
                    <b>{b.session === "morning" ? tc.morning : tc.afternoon}</b>
                    <small>{(b.periods || []).map(p => `${tc.periodPrefix} ${p}`).join(", ")}</small>
                  </td>
                  <td className="purpose-cell">{b.purpose}</td>
                  <td>
                    <span className={`status-pill ${b.status === "Đã duyệt" ? "approved" : b.status === "Từ chối" ? "rejected" : "pending"}`}>
                      {ts[b.status] || b.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-group">
                      {currentUser.role === "admin" || currentUser.role === "manager" || currentUser.role === "teacher" ? (
                        <>
                          {b.status === "Chờ duyệt" ? (
                            <>
                              <button className="approve-btn" onClick={() => onUpdate(b.id, "Đã duyệt")}>{tc.approveBtn}</button>
                              <button className="reject-btn" onClick={() => onUpdate(b.id, "Từ chối")}>{tc.rejectBtn}</button>
                            </>
                          ) : (
                            <button className="reset-btn" onClick={() => onUpdate(b.id, "Chờ duyệt")}>{tc.resetBtn}</button>
                          )}
                          <button className="reset-btn" style={{ color: "#c62828" }} title={tc.deleteBtn} onClick={() => onDelete(b.id)}>
                            <Trash2 size={13}/>
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: "9px", color: "#8a98a8" }}>{tc.viewOnly}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#8a98a8" }}>
                    {t.noMatch}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ==========================================
// PAGE: LOCKERS MONITORING & IOT
// ==========================================
function LockersPage({ lockers, onToggle, lang = "vi" }) {
  const t = translations[lang]?.lockers || translations.vi.lockers;
  const tc = translations[lang]?.common || translations.vi.common;
  const [showGuide, setShowGuide] = useState(false);
  const openCount = lockers.filter(x => x.state === "open").length;

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          <button className="secondary-btn" onClick={() => setShowGuide(!showGuide)}>
            <Cpu size={15}/> {showGuide ? t.guideBtnClose : t.guideBtnOpen}
          </button>
        }
      />

      <div className="locker-summary">
        <div><span>{t.totalLockers}</span><b>{lockers.length}</b></div>
        <div><span>{t.safeClosed}</span><b className="good-text">{lockers.length - openCount}</b></div>
        <div><span>{t.opening}</span><b className="warn-text">{openCount}</b></div>
      </div>

      {showGuide && (
        <section className="panel" style={{ marginBottom: "20px", background: "#f8fbff", borderColor: "#cde1f5" }}>
          <div className="panel-head">
            <div>
              <h3>{t.guideTitle}</h3>
              <p>{t.guideDesc}</p>
            </div>
            <span className="table-chip">REST API WEBHOOK</span>
          </div>
          <p style={{ fontSize: "11px", color: "#445566" }}>
            {t.guideText}
          </p>
          <div className="code-box">
            {t.codeComment}<br/>
            #include &lt;WiFi.h&gt;<br/>
            #include &lt;HTTPClient.h&gt;<br/>
            const char* serverUrl = "http://192.168.1.100:5000/api/lockers/L01";<br/>
            <br/>
            void sendLockerState(bool isOpen) &#123;<br/>
            &nbsp;&nbsp;HTTPClient http;<br/>
            &nbsp;&nbsp;http.begin(serverUrl);<br/>
            &nbsp;&nbsp;http.addHeader("Content-Type", "application/json");<br/>
            &nbsp;&nbsp;String payload = String("&#123;\"state\":\"") + (isOpen ? "open" : "closed") + "\",\"source\":\"" + {t.codeSource} + "\"&#125;";<br/>
            &nbsp;&nbsp;int httpResponseCode = http.PUT(payload);<br/>
            &nbsp;&nbsp;http.end();<br/>
            &#125;
          </div>
        </section>
      )}

      <div className="locker-grid">
        {lockers.map(x => (
          <section className="panel locker-card" key={x.id}>
            <div className="locker-card-top">
              <div className={`locker-icon ${x.state}`}>
                {x.state === "open" ? <LockOpen size={22}/> : <Lock size={22}/>}
              </div>
              <span className={`status-pill ${x.state === "open" ? "pending" : "approved"}`}>
                {x.state === "open" ? tc.open : tc.closed}
              </span>
            </div>
            <h3>{translateLockerName(x.name, lang)}</h3>
            <p>{translateLockerLocation(x.location, lang)}</p>
            <div className="locker-meta">
              <span>{t.codeId}: {x.id}</span>
              <span>{t.codeUpdated}: {x.updatedAt || x.updated_at || "-"}</span>
            </div>
            <button className="secondary-btn simulate-btn" onClick={() => onToggle(x.id)}>
              {x.state === "open" ? <Lock size={15}/> : <LockOpen size={15}/>}
              {t.simulateBtnPrefix} {x.state === "open" ? t.simulateClose : t.simulateOpen}
            </button>
          </section>
        ))}
      </div>
    </>
  );
}

// ==========================================
// PAGE: LOCKER HISTORY
// ==========================================
function LockerHistoryPage({ logs, lang = "vi" }) {
  const t = translations[lang]?.lockerHistory || translations.vi.lockerHistory;
  const tc = translations[lang]?.common || translations.vi.common;
  const isEn = lang === "en";

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          <a href={api.getExportCsvUrl("locker-logs")} download className="secondary-btn" style={{ textDecoration: "none" }}>
            <Download size={15}/> {tc.exportCsv}
          </a>
        }
      />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>{t.panelTitle.replace("{count}", logs.length)}</h3>
            <p>{t.panelDesc}</p>
          </div>
          <span className="table-chip">SQLITE LOGS</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.colDate}</th>
                <th>{t.colTime}</th>
                <th>{t.colLocker}</th>
                <th>{t.colEvent}</th>
                <th>{t.colSource}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(x => (
                <tr key={x.id}>
                  <td>{x.date}</td>
                  <td><b>{x.time}</b></td>
                  <td><b>{translateLockerName(x.locker_name, lang)}</b></td>
                  <td>
                    <span className={`status-pill ${x.event.includes("Mở") ? "pending" : "approved"}`}>
                      {isEn ? (x.event.includes("Mở") ? "Open Locker" : "Close Locker") : x.event}
                    </span>
                  </td>
                  <td>
                    {isEn ? (
                      x.source === "Cảm biến từ" ? "Magnetic Sensor" :
                      x.source === "Cảm biến từ ESP32" ? "ESP32 Magnetic Sensor" :
                      (x.source === "Mô phỏng giao diện" || x.source === "Mô phỏng") ? "UI Simulation" :
                      (x.source || t.defaultSource)
                    ) : (x.source || t.defaultSource)}
                  </td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "20px", color: "#8a98a8" }}>
                    {t.noEvents}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ==========================================
// PAGE: CAMERA & AI DETECTION (WITH WEBCAM SUPPORT)
// ==========================================
function CameraPage({ onRecordEntry, lang = "vi" }) {
  const t = translations[lang]?.camera || translations.vi.camera;
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  async function startWebcam() {
    setWebcamError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      streamRef.current = stream;
      setIsWebcamActive(true);
    } catch (err) {
      console.error("Webcam error:", err);
      setWebcamError(t.webcamError);
    }
  }

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsWebcamActive(false);
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  function captureSnapshot() {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.download = `STEM_Snapshot_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
      />

      <div className="camera-layout">
        <section className="panel camera-panel">
          <div className="panel-head">
            <div>
              <h3>{t.panelTitle}</h3>
              <p>{t.panelDesc}</p>
            </div>
            <span className={`status-pill ${isWebcamActive ? "approved" : "pending"}`}>
              {isWebcamActive ? t.liveStatus : t.offlineStatus}
            </span>
          </div>

          <div className="camera-active-container">
            {isWebcamActive ? (
              <>
                <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                <div className="ai-badge">{t.aiBadge}</div>
                {/* Simulated AI Detection Bounding Box */}
                <div className="ai-box" style={{ width: "35%", height: "65%", top: "18%", left: "32%" }}>
                  <div className="ai-tag">{t.personTag}</div>
                </div>
              </>
            ) : (
              <div className="camera-screen-inner">
                <div className="camera-cross"><Camera size={42}/></div>
                <b>{t.notActiveTitle}</b>
                <span>
                  {t.notActiveHint}
                </span>
              </div>
            )}
            <div className="camera-overlay">
              CAM 01 <span>{isWebcamActive ? t.camOnline : t.camOffline}</span>
            </div>
          </div>

          {webcamError && <div className="form-error" style={{ marginTop: "10px" }}>{webcamError}</div>}

          <div className="camera-controls">
            {!isWebcamActive ? (
              <button className="primary-btn" onClick={startWebcam}>
                <Play size={16}/> {t.startWebcam}
              </button>
            ) : (
              <>
                <button className="secondary-btn" onClick={stopWebcam}>
                  <Square size={16}/> {t.stopWebcam}
                </button>
                <button className="secondary-btn" onClick={captureSnapshot}>
                  <Camera size={16}/> {t.snapshot}
                </button>
              </>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: "#667788" }}>{t.aiSimLabel}</span>
              <button
                className="secondary-btn"
                style={{ background: "#e5f7ef", color: "#168e7e" }}
                onClick={() => onRecordEntry("in", t.inEventLabel, 1)}
              >
                <ArrowDownToLine size={14}/> {t.recordInBtn}
              </button>
              <button
                className="secondary-btn"
                style={{ background: "#fff3e2", color: "#d58a2f" }}
                onClick={() => onRecordEntry("out", t.outEventLabel, 1)}
              >
                <ArrowUpFromLine size={14}/> {t.recordOutBtn}
              </button>
            </div>
          </div>
        </section>

        <aside className="panel tips-panel">
          <div className="tips-icon"><ShieldCheck/></div>
          <h3>{t.tipsTitle}</h3>
          <ol>
            <li>{t.tip1}</li>
            <li>{t.tip2}</li>
            <li>{t.tip3}</li>
            <li>{t.tip4}</li>
            <li>{t.tip5}</li>
          </ol>
          <div className="code-box">
            # Python OpenCV Webhook snippet:<br/>
            import requests<br/>
            requests.post("http://localhost:5000/api/entry-logs", json=&#123;<br/>
            &nbsp;&nbsp;"direction": "in",<br/>
            &nbsp;&nbsp;"label": "{t.inEventLabel}",<br/>
            &nbsp;&nbsp;"count": 1<br/>
            &#125;)
          </div>
        </aside>
      </div>
    </>
  );
}

// ==========================================
// PAGE: ENTRY REPORT
// ==========================================
function EntryReportPage({ logs, lang = "vi" }) {
  const t = translations[lang]?.entryReport || translations.vi.entryReport;
  const tc = translations[lang]?.common || translations.vi.common;
  const inCount = logs.filter(x => x.direction === "in").reduce((s,x) => s + (Number(x.count) || 1), 0);
  const outCount = logs.filter(x => x.direction === "out").reduce((s,x) => s + (Number(x.count) || 1), 0);

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          <a href={api.getExportCsvUrl("entry-logs")} download className="secondary-btn" style={{ textDecoration: "none" }}>
            <Download size={15}/> {tc.exportCsv}
          </a>
        }
      />

      <div className="stats-grid entry-stats">
        <Stat icon={ArrowDownToLine} label={t.statIn} value={inCount} hint={t.statInHint} tone="green"/>
        <Stat icon={ArrowUpFromLine} label={t.statOut} value={outCount} hint={t.statOutHint} tone="orange"/>
        <Stat icon={Users} label={t.statPresent} value={Math.max(0, inCount - outCount)} hint={t.statPresentHint} tone="blue"/>
        <Stat icon={Camera} label={t.statTotal} value={logs.length} hint={t.statTotalHint} tone="purple"/>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>{t.panelTitle.replace("{count}", logs.length)}</h3>
            <p>{t.panelDesc}</p>
          </div>
          <span className="table-chip">CAMERA LOGS</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.colDate}</th>
                <th>{t.colTime}</th>
                <th>{t.colDirection}</th>
                <th>{t.colDesc}</th>
                <th>{t.colCount}</th>
                <th>{t.colCamera}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(x => (
                <tr key={x.id}>
                  <td>{x.date}</td>
                  <td><b>{x.time}</b></td>
                  <td>
                    <span className={`status-pill ${x.direction === "in" ? "approved" : "pending"}`}>
                      {x.direction === "in" ? t.pillIn : t.pillOut}
                    </span>
                  </td>
                  <td>{translateEntryLabel(x.label, lang)}</td>
                  <td><b>{x.count}</b></td>
                  <td>{translateCameraSource(x.camera || t.defaultCamera, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ==========================================
// PAGE: DEVICES MANAGEMENT (CRUD + HIERARCHICAL BORROW/RETURN)
// ==========================================
function formatDateTime(isoStr, lang = "vi") {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const locale = lang === "en" ? "en-GB" : "vi-VN";
    const date = d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
    const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return `${time} ${date}`;
  } catch (e) {
    return isoStr;
  }
}

function getLocalIsoString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function DevicesPage({ devices, lockers, currentUser, onAdd, onUpdate, onDelete, onBorrow, onReturn, lang = "vi" }) {
  const t = translations[lang]?.devices || translations.vi.devices;
  const tc = translations[lang]?.common || translations.vi.common;
  const tcat = translations[lang]?.categories || translations.vi.categories;
  const ts = translations[lang]?.statuses || translations.vi.statuses;
  const isEn = lang === "en";

  const [activeTab, setActiveTab] = useState("inventory"); // "inventory" | "history"
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // "all" | "main" | "standalone"
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "ready" | "borrowed" | "overdue"
  const [expandedKits, setExpandedKits] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [borrowingDevice, setBorrowingDevice] = useState(null);
  const [returningDevice, setReturningDevice] = useState(null);

  // Safety fallback: ensure all 184 equipment items are always present
  const safeDevices = useMemo(() => {
    return (devices && Array.isArray(devices) && devices.length >= 30) ? devices : INITIAL_EQUIPMENT_DATA;
  }, [devices]);

  // Group sub-components by parentCode
  const subItemsByParent = useMemo(() => {
    const map = {};
    for (const d of safeDevices) {
      if (d.type === "sub" && d.parentCode) {
        if (!map[d.parentCode]) map[d.parentCode] = [];
        map[d.parentCode].push(d);
      }
    }
    return map;
  }, [safeDevices]);

  // Aggregate all borrow history records across devices
  const allBorrowHistory = useMemo(() => {
    const records = [];
    for (const d of safeDevices) {
      if (d.borrowHistory && d.borrowHistory.length > 0) {
        for (const h of d.borrowHistory) {
          records.push({
            ...h,
            deviceCode: h.deviceCode || d.code,
            deviceName: h.deviceName || d.name,
            deviceNameEn: h.deviceNameEn || d.nameEn,
            locker_id: h.locker_id || d.locker_id,
            unit: h.unit || d.unit,
            unitEn: h.unitEn || d.unitEn
          });
        }
      }
    }
    // Sort newest borrow time first
    return records.sort((a, b) => new Date(b.borrowTime || 0) - new Date(a.borrowTime || 0));
  }, [safeDevices]);

  const historyMetrics = useMemo(() => {
    const total = allBorrowHistory.length;
    const active = allBorrowHistory.filter(h => h.status === "Đang mượn").length;
    const onTime = allBorrowHistory.filter(h => h.status === "Đã hoàn trả" || h.returnStatus === "Đúng hạn").length;
    const overdue = allBorrowHistory.filter(h => {
      if (h.status === "Quá hạn" || h.returnStatus === "Trễ hạn") return true;
      if (h.status === "Đang mượn" && h.expectedReturnTime && new Date() > new Date(h.expectedReturnTime)) return true;
      return false;
    }).length;
    return { total, active, onTime, overdue };
  }, [allBorrowHistory]);

  const categories = useMemo(() => {
    const set = new Set(safeDevices.map(d => d.category).filter(Boolean));
    return Array.from(set);
  }, [safeDevices]);

  const toggleKit = (code) => {
    setExpandedKits(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Top level items: only main kits and standalone items
  const filteredTopLevel = useMemo(() => {
    return safeDevices.filter(d => {
      // Must be top-level (not a sub-component)
      if (d.type === "sub") return false;

      // Type filter
      if (typeFilter !== "all" && d.type !== typeFilter) return false;

      // Category filter
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;

      // Check overdue state
      const isOverdue = Boolean(d.borrower && d.expectedReturnTime && new Date() > new Date(d.expectedReturnTime));

      // Status filter
      if (statusFilter === "ready" && (d.available <= 0 || d.borrower)) return false;
      if (statusFilter === "borrowed" && !d.borrower) return false;
      if (statusFilter === "overdue" && !isOverdue) return false;

      // Search match (checks self and any of its sub-components!)
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSelf =
          (d.name && d.name.toLowerCase().includes(q)) ||
          (d.nameEn && d.nameEn.toLowerCase().includes(q)) ||
          (d.code && d.code.toLowerCase().includes(q)) ||
          (d.locker_id && d.locker_id.toLowerCase().includes(q)) ||
          (d.borrower && d.borrower.toLowerCase().includes(q));

        if (matchSelf) return true;

        // Check if any sub-item matches
        const subs = subItemsByParent[d.code] || [];
        const matchSub = subs.some(sub =>
          (sub.name && sub.name.toLowerCase().includes(q)) ||
          (sub.nameEn && sub.nameEn.toLowerCase().includes(q)) ||
          (sub.code && sub.code.toLowerCase().includes(q))
        );

        if (matchSub) {
          // Auto-expand this kit so user immediately sees matched sub-items
          return true;
        }

        return false;
      }

      return true;
    });
  }, [safeDevices, categoryFilter, typeFilter, statusFilter, searchTerm, subItemsByParent]);

  // If search term matches a sub-item, make sure its parent kit is expanded
  useEffect(() => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const toExpand = new Set(expandedKits);
      let changed = false;
      for (const d of safeDevices) {
        if (d.type === "main") {
          const subs = subItemsByParent[d.code] || [];
          if (subs.some(s =>
            s.name?.toLowerCase().includes(q) ||
            s.nameEn?.toLowerCase().includes(q) ||
            s.code?.toLowerCase().includes(q)
          )) {
            if (!toExpand.has(d.code)) {
              toExpand.add(d.code);
              changed = true;
            }
          }
        }
      }
      if (changed) setExpandedKits(toExpand);
    }
  }, [searchTerm, safeDevices, subItemsByParent]);

  const activeBorrowedCount = safeDevices.filter(d => d.borrower).length;

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          <div style={{ display: "flex", gap: "8px" }}>
            <a href={api.getExportCsvUrl("devices")} download className="secondary-btn" style={{ textDecoration: "none" }}>
              <Download size={15}/> {tc.exportCsv}
            </a>
            {(currentUser.role === "admin" || currentUser.role === "manager" || currentUser.role === "teacher") && (
              <button className="primary-btn" onClick={() => setShowAddModal(true)}>
                <Plus size={16}/> {t.addBtn}
              </button>
            )}
          </div>
        }
      />

      <section className="panel">
        {/* Navigation Tabs: Inventory vs Borrowing History */}
        <div className="tab-group">
          <button
            className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
            onClick={() => setActiveTab("inventory")}
          >
            <Layers size={14}/>
            {t.tabInventory}
            <span className="tab-badge">{filteredTopLevel.length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <History size={14}/>
            {t.tabBorrowHistory}
            {activeBorrowedCount > 0 && (
              <span className="tab-badge" style={{ background: "#fef3c7", color: "#b45309" }}>
                {activeBorrowedCount} {isEn ? "active" : "đang mượn"}
              </span>
            )}
          </button>
        </div>

        {activeTab === "inventory" ? (
          <>
            <div className="panel-head" style={{ marginBottom: "14px" }}>
              <div>
                <h3>{t.panelTitle.replace("{count}", filteredTopLevel.length)}</h3>
                <p>{t.panelDesc}</p>
              </div>
              <div className="filter-bar" style={{ margin: 0 }}>
                <input
                  className="search-input"
                  placeholder={t.searchPlaceholder}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ width: "230px" }}
                />
                <select className="filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                  <option value="all">{tc.allCategories}</option>
                  {categories.map(c => <option key={c} value={c}>{tcat[c] || c}</option>)}
                </select>
                <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="all">{t.filterAllTypes}</option>
                  <option value="main">{t.filterMainKits}</option>
                  <option value="standalone">{t.filterStandalone}</option>
                </select>
                <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="all">{t.filterAllStatus}</option>
                  <option value="ready">{t.filterReady}</option>
                  <option value="borrowed">{t.filterBorrowed}</option>
                  <option value="overdue">{t.filterOverdue}</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "100px" }}>{t.colCode}</th>
                    <th style={{ minWidth: "240px" }}>{t.colName}</th>
                    <th>{t.colType}</th>
                    <th>{t.colCategory}</th>
                    <th>{t.colLocker}</th>
                    <th>{t.colAvailable}</th>
                    <th>{t.colStatus}</th>
                    <th style={{ minWidth: "160px" }}>{t.colBorrowInfo}</th>
                    <th style={{ textAlign: "right" }}>{t.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopLevel.map(d => {
                    const subItems = subItemsByParent[d.code] || [];
                    const isExpanded = expandedKits.has(d.code);
                    const isOverdue = Boolean(d.borrower && d.expectedReturnTime && new Date() > new Date(d.expectedReturnTime));
                    const displayName = isEn ? (d.nameEn || d.name) : d.name;
                    const displayUnit = isEn ? (d.unitEn || d.unit) : d.unit;

                    return (
                      <React.Fragment key={d.id}>
                        <tr style={{ background: isExpanded ? "#f8fafc" : "transparent" }}>
                          {/* Mã TB & Expand button if kit */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {d.type === "main" && (
                                <button
                                  className={`expand-btn ${isExpanded ? "expanded" : ""}`}
                                  onClick={() => toggleKit(d.code)}
                                  style={{ padding: "3px 6px", fontSize: "9px" }}
                                  title={isExpanded ? t.hideSubItems : t.viewSubItems.replace("{count}", subItems.length)}
                                >
                                  {isExpanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                </button>
                              )}
                              <span className={`code-pill ${d.type}`}>
                                {d.code}
                              </span>
                            </div>
                          </td>

                          {/* Tên thiết bị */}
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                              <b style={{ color: "#1e293b", fontSize: "11px", whiteSpace: "normal" }}>
                                {displayName}
                              </b>
                              {d.type === "main" && (
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "9px", color: "#168e7e", fontWeight: "600" }}>
                                    ↳ {subItems.length} {t.subComponentBadge.toLowerCase()}
                                  </span>
                                  {!isExpanded && (
                                    <button
                                      className="text-btn"
                                      onClick={() => toggleKit(d.code)}
                                      style={{ fontSize: "9px", padding: 0 }}
                                    >
                                      ({t.viewSubItems.replace("{count}", subItems.length)})
                                    </button>
                                  )}
                                </div>
                              )}
                              {d.description && d.type !== "main" && (
                                <small style={{ color: "#94a3b8" }}>{translateDeviceDesc(d.description, lang)}</small>
                              )}
                            </div>
                          </td>

                          {/* Phân loại */}
                          <td>
                            <span className={`type-pill ${d.type}`}>
                              {d.type === "main" ? t.mainKitBadge : t.standaloneBadge}
                            </span>
                          </td>

                          {/* Danh mục */}
                          <td>
                            <span style={{ fontSize: "10px", color: "#475569" }}>
                              {tcat[d.category] || (isEn ? d.categoryEn : d.category)}
                            </span>
                          </td>

                          {/* Vị trí Hộc tủ */}
                          <td>
                            <span className="table-chip">{d.locker_id || t.unassigned}</span>
                          </td>

                          {/* Khả dụng / Tổng */}
                          <td>
                            <b style={{ color: d.available > 0 ? "#168e7e" : "#e11d48", fontSize: "11px" }}>
                              {d.available != null ? d.available : d.quantity}
                            </b>
                            <span style={{ color: "#64748b", fontSize: "10px" }}> / {d.quantity} {displayUnit}</span>
                          </td>

                          {/* Tình trạng */}
                          <td>
                            {d.borrower ? (
                              isOverdue ? (
                                <span className="status-pill rejected" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                  <Clock3 size={10}/> {t.overdueBadge}
                                </span>
                              ) : (
                                <span className="status-pill pending">
                                  {ts["Đang mượn"] || "Đang mượn"}
                                </span>
                              )
                            ) : (
                              <span className="status-pill approved">
                                {ts["Sẵn sàng"] || "Sẵn sàng"}
                              </span>
                            )}
                          </td>

                          {/* Thông tin mượn & Hạn trả */}
                          <td>
                            {d.borrower ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <div>
                                  <b style={{ color: "#0f172a" }}>{d.borrower}</b>
                                  {d.borrowerClass && <small style={{ color: "#475569", marginLeft: "4px" }}>({d.borrowerClass})</small>}
                                </div>
                                <div className="time-tag">
                                  <span>{t.borrowDateLabel}</span>
                                  <b>{formatDateTime(d.borrowTime, lang)}</b>
                                </div>
                                <div className="time-tag">
                                  <span>{t.dueTimeLabel}</span>
                                  <b style={{ color: isOverdue ? "#b91c1c" : "#334155" }}>{formatDateTime(d.expectedReturnTime, lang)}</b>
                                  {isOverdue && <span className="overdue-tag">{t.overdueBadge}</span>}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "9.5px" }}>{t.inStock}</span>
                            )}
                          </td>

                          {/* Thao tác */}
                          <td>
                            <div className="action-group" style={{ justifyContent: "flex-end" }}>
                              {(d.available == null || d.available > 0) && (
                                <button className="approve-btn" onClick={() => setBorrowingDevice(d)}>
                                  <ArrowUpFromLine size={12}/> {t.borrowBtn}
                                </button>
                              )}
                              {d.borrower && (
                                <button
                                  className="reset-btn"
                                  onClick={() => setReturningDevice(d)}
                                  style={{ background: "#fef3c7", color: "#b45309" }}
                                >
                                  <ArrowDownToLine size={12}/> {t.returnBtn}
                                </button>
                              )}
                              {d.type === "main" && (
                                <button
                                  className={`expand-btn ${isExpanded ? "expanded" : ""}`}
                                  onClick={() => toggleKit(d.code)}
                                  style={{ fontSize: "9px" }}
                                >
                                  {isExpanded ? t.hideSubItems : t.viewSubItems.replace("{count}", subItems.length)}
                                </button>
                              )}
                              {(currentUser.role === "admin" || currentUser.role === "manager" || currentUser.role === "teacher") && (
                                <button className="reset-btn" onClick={() => setEditingDevice(d)} title={t.editTooltip}>
                                  <Edit size={12}/>
                                </button>
                              )}
                              {currentUser.role === "admin" && (
                                <button className="reset-btn" style={{ color: "#c62828" }} onClick={() => onDelete(d.id)} title={t.deleteTooltip}>
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* ACCORDION NESTED DRAWER: SUB-COMPONENTS TABLE */}
                        {isExpanded && (
                          <tr className="sub-accordion-row">
                            <td colSpan={9} style={{ padding: 0 }}>
                              <div className="sub-accordion-container">
                                <div className="sub-header">
                                  <span>
                                    ↳ {t.subComponentsOf.replace("{code}", d.code).replace("{name}", displayName)}
                                  </span>
                                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "normal" }}>
                                    {subItems.length} {t.subComponentBadge.toLowerCase()}
                                  </span>
                                </div>
                                <table className="sub-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: "90px" }}>{t.colCode}</th>
                                      <th>{t.colName}</th>
                                      <th>{tc.quantity || "Số lượng"}</th>
                                      <th>{t.colLocker}</th>
                                      <th>{t.colStatus}</th>
                                      <th>{t.colBorrowInfo}</th>
                                      <th style={{ textAlign: "right" }}>{t.colActions}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subItems.map(sub => {
                                      const subDisplayName = isEn ? (sub.nameEn || sub.name) : sub.name;
                                      const subUnit = isEn ? (sub.unitEn || sub.unit) : sub.unit;
                                      const subOverdue = Boolean(sub.borrower && sub.expectedReturnTime && new Date() > new Date(sub.expectedReturnTime));

                                      return (
                                        <tr key={sub.id}>
                                          <td>
                                            <span className="code-pill sub">{sub.code}</span>
                                          </td>
                                          <td>
                                            <b style={{ color: "#334155" }}>{subDisplayName}</b>
                                          </td>
                                          <td>
                                            <b>{sub.available != null ? sub.available : sub.quantity}</b> / {sub.quantity} {subUnit}
                                          </td>
                                          <td>
                                            <span className="table-chip">{sub.locker_id || d.locker_id}</span>
                                          </td>
                                          <td>
                                            {sub.borrower ? (
                                              subOverdue ? (
                                                <span className="status-pill rejected" style={{ fontSize: "8.5px" }}>
                                                  {t.overdueBadge}
                                                </span>
                                              ) : (
                                                <span className="status-pill pending" style={{ fontSize: "8.5px" }}>
                                                  {ts["Đang mượn"] || "Đang mượn"}
                                                </span>
                                              )
                                            ) : (
                                              <span className="status-pill approved" style={{ fontSize: "8.5px" }}>
                                                {ts["Sẵn sàng"] || "Sẵn sàng"}
                                              </span>
                                            )}
                                          </td>
                                          <td>
                                            {sub.borrower ? (
                                              <div style={{ fontSize: "9px" }}>
                                                <b>{sub.borrower}</b>
                                                <div>{t.dueTimeLabel} {formatDateTime(sub.expectedReturnTime, lang)}</div>
                                              </div>
                                            ) : (
                                              <span style={{ color: "#94a3b8", fontSize: "9px" }}>{t.inStock}</span>
                                            )}
                                          </td>
                                          <td>
                                            <div className="action-group" style={{ justifyContent: "flex-end" }}>
                                              {(sub.available == null || sub.available > 0) ? (
                                                <button
                                                  className="approve-btn"
                                                  onClick={() => setBorrowingDevice(sub)}
                                                  style={{ padding: "4px 7px", fontSize: "8.5px" }}
                                                >
                                                  <ArrowUpFromLine size={10}/> {t.borrowBtn}
                                                </button>
                                              ) : (
                                                <button
                                                  className="reset-btn"
                                                  onClick={() => setReturningDevice(sub)}
                                                  style={{ padding: "4px 7px", fontSize: "8.5px", background: "#fef3c7", color: "#b45309" }}
                                                >
                                                  <ArrowDownToLine size={10}/> {t.returnBtn}
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {!subItems.length && (
                                      <tr>
                                        <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", padding: "12px" }}>
                                          {t.noSubItems}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {!filteredTopLevel.length && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: "40px 20px", color: "#8a98a8" }}>
                        {t.noMatch}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* TAB 2: BORROWING & RETURN HISTORY */
          <div>
            <div className="panel-head">
              <div>
                <h3>{t.historyTitle.replace("{count}", allBorrowHistory.length)}</h3>
                <p>{t.historyDesc}</p>
              </div>
            </div>

            {/* History summary metrics */}
            <div className="history-summary-grid">
              <div className="history-card">
                <div className="history-card-label">{isEn ? "Total Loan Transactions" : "Tổng lượt mượn trả"}</div>
                <div className="history-card-val">{historyMetrics.total}</div>
              </div>
              <div className="history-card">
                <div className="history-card-label" style={{ color: "#b45309" }}>{isEn ? "Currently On Loan" : "Đang mượn sử dụng"}</div>
                <div className="history-card-val" style={{ color: "#d97706" }}>{historyMetrics.active}</div>
              </div>
              <div className="history-card">
                <div className="history-card-label" style={{ color: "#15803d" }}>{isEn ? "Returned On Time" : "Hoàn trả đúng hạn"}</div>
                <div className="history-card-val" style={{ color: "#16a34a" }}>{historyMetrics.onTime}</div>
              </div>
              <div className="history-card">
                <div className="history-card-label" style={{ color: "#b91c1c" }}>{isEn ? "Overdue / Late" : "Quá hạn / Trễ hạn"}</div>
                <div className="history-card-val" style={{ color: "#dc2626" }}>{historyMetrics.overdue}</div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.colCode}</th>
                    <th>{t.colName}</th>
                    <th>{isEn ? "Borrower / Class" : "Người mượn & Đơn vị"}</th>
                    <th>{t.colQty}</th>
                    <th>{t.borrowDateLabel}</th>
                    <th>{t.dueTimeLabel}</th>
                    <th>{t.actualReturnLabel}</th>
                    <th>{t.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {allBorrowHistory.map(h => {
                    const devName = isEn ? (h.deviceNameEn || h.deviceName) : h.deviceName;
                    const devUnit = isEn ? (h.unitEn || h.unit) : h.unit;
                    const isLate = h.status === "Quá hạn" || h.returnStatus === "Trễ hạn" ||
                      (h.status === "Đang mượn" && h.expectedReturnTime && new Date() > new Date(h.expectedReturnTime));

                    return (
                      <tr key={h.id}>
                        <td>
                          <span className="code-pill">{h.deviceCode}</span>
                        </td>
                        <td>
                          <b style={{ color: "#1e293b" }}>{devName}</b>
                          {h.notes && <small style={{ color: "#64748b" }}>{h.notes}</small>}
                        </td>
                        <td>
                          <b>{h.borrower}</b>
                          {h.borrowerClass && <small style={{ color: "#475569" }}>{h.borrowerClass}</small>}
                          {h.borrowerPhone && <small style={{ color: "#94a3b8" }}>{tc.phonePrefix} {h.borrowerPhone}</small>}
                        </td>
                        <td>
                          <b>{h.quantity}</b> {devUnit}
                        </td>
                        <td>
                          <span style={{ fontSize: "10px", color: "#334155" }}>{formatDateTime(h.borrowTime, lang)}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "10px", color: isLate ? "#b91c1c" : "#334155", fontWeight: isLate ? "700" : "500" }}>
                            {formatDateTime(h.expectedReturnTime, lang)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "10px", color: "#168e7e" }}>
                            {h.actualReturnTime ? formatDateTime(h.actualReturnTime, lang) : (isEn ? "Not returned yet" : "Chưa hoàn trả")}
                          </span>
                        </td>
                        <td>
                          {h.status === "Đang mượn" ? (
                            isLate ? (
                              <span className="overdue-tag">
                                <Clock3 size={10}/> {t.overdueBadge}
                              </span>
                            ) : (
                              <span className="status-pill pending">
                                {ts["Đang mượn"] || "Đang mượn"}
                              </span>
                            )
                          ) : (
                            <span className="ontime-tag">
                              {h.returnStatus === "Trễ hạn" ? (isEn ? "Returned Late" : "Trả trễ") : (isEn ? "Returned On Time" : "Đã trả đúng hạn")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!allBorrowHistory.length && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        {t.noHistory}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Modal Thêm thiết bị */}
      {showAddModal && (
        <DeviceFormModal
          title={t.addModalTitle}
          lockers={lockers}
          onSave={async (data) => {
            const ok = await onAdd(data);
            if (ok) setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
          lang={lang}
        />
      )}

      {/* Modal Sửa thiết bị */}
      {editingDevice && (
        <DeviceFormModal
          title={t.editModalTitle}
          initialData={editingDevice}
          lockers={lockers}
          onSave={async (data) => {
            const ok = await onUpdate(editingDevice.id, data);
            if (ok) setEditingDevice(null);
          }}
          onClose={() => setEditingDevice(null)}
          lang={lang}
        />
      )}

      {/* Modal Mượn thiết bị có chọn mốc thời gian */}
      {borrowingDevice && (
        <BorrowModal
          device={borrowingDevice}
          currentUser={currentUser}
          onConfirm={async (borrowData) => {
            const ok = await onBorrow(borrowingDevice.id, borrowData);
            if (ok) setBorrowingDevice(null);
          }}
          onClose={() => setBorrowingDevice(null)}
          lang={lang}
        />
      )}

      {/* Modal Trả thiết bị có ghi nhận thời gian trả thực tế */}
      {returningDevice && (
        <ReturnModal
          device={returningDevice}
          onConfirm={async (returnData) => {
            const ok = await onReturn(returningDevice.id, returnData);
            if (ok) setReturningDevice(null);
          }}
          onClose={() => setReturningDevice(null)}
          lang={lang}
        />
      )}
    </>
  );
}

function DeviceFormModal({ title, initialData = {}, lockers, onSave, onClose, lang = "vi" }) {
  const t = translations[lang]?.devices || translations.vi.devices;
  const tc = translations[lang]?.common || translations.vi.common;
  const tcat = translations[lang]?.categories || translations.vi.categories;

  const [formData, setFormData] = useState({
    code: initialData.code || "",
    name: initialData.name || "",
    category: initialData.category || "Chế tạo & In 3D",
    locker_id: initialData.locker_id || "L01",
    quantity: initialData.quantity || 1,
    unit: initialData.unit || "Cái",
    type: initialData.type || "standalone",
    description: initialData.description || ""
  });

  const change = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  function submit(e) {
    e.preventDefault();
    onSave(formData);
  }

  const categoryList = [
    "CNTT & Máy tính",
    "Bảo hộ & An toàn",
    "Chế tạo & In 3D",
    "STEM Khoa học",
    "Điện tử & Vi mạch",
    "AI & IoT Thông minh",
    "Mô hình Năng lượng & Smart Home",
    "Robotics VEX & KCbot",
    "Đào tạo & Dịch vụ",
    "Thiết bị chế tạo",
    "Bộ kít lập trình",
    "Thiết bị điện tử"
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid" style={{ marginTop: 0 }}>
            <label>
              {t.nameLabel}
              <input name="name" value={formData.name} onChange={change} placeholder={t.namePlaceholder} required/>
            </label>
            <label>
              {t.codeLabel}
              <input name="code" value={formData.code} onChange={change} placeholder={t.codePlaceholder}/>
            </label>
            <label>
              {t.categoryLabel}
              <select name="category" value={formData.category} onChange={change}>
                {categoryList.map(c => (
                  <option key={c} value={c}>{tcat[c] || c}</option>
                ))}
              </select>
            </label>
            <label>
              {t.lockerLabel}
              <select name="locker_id" value={formData.locker_id} onChange={change}>
                {lockers.map(l => (
                  <option key={l.id} value={l.id}>{l.id} - {translateLockerName(l.name, lang)}</option>
                ))}
                <option value="Kho">{tc.lockerStorage}</option>
              </select>
            </label>
            <label>
              {t.quantityLabel}
              <input type="number" min="1" name="quantity" value={formData.quantity} onChange={change} required/>
            </label>
            <label>
              {tc.unit}
              <input name="unit" value={formData.unit} onChange={change} placeholder={t.unitPlaceholder}/>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              {t.descLabel}
              <input name="description" value={formData.description} onChange={change} placeholder={t.descPlaceholder}/>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>{tc.cancel}</button>
            <button type="submit" className="primary-btn">{t.saveDeviceBtn}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BorrowModal({ device, currentUser, onConfirm, onClose, lang = "vi" }) {
  const t = translations[lang]?.devices || translations.vi.devices;
  const tc = translations[lang]?.common || translations.vi.common;
  const isEn = lang === "en";

  // Pre-fill borrow time (now) and expected return time (+2 hours)
  const now = new Date();
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [formData, setFormData] = useState({
    borrower: currentUser.name || "",
    borrowerClass: currentUser.department || "",
    borrowerPhone: "",
    quantity: 1,
    borrowTime: getLocalIsoString(now),
    expectedReturnTime: getLocalIsoString(later),
    notes: ""
  });

  const availableMax = device.available != null ? device.available : device.quantity;
  const displayName = isEn ? (device.nameEn || device.name) : device.name;
  const displayUnit = isEn ? (device.unitEn || device.unit) : device.unit;

  function submit(e) {
    e.preventDefault();
    if (!formData.borrower.trim()) return;
    onConfirm(formData);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>{t.borrowModalTitle.replace("{name}", displayName)}</h3>
            <span className="code-pill" style={{ marginTop: "4px" }}>{tc.codePrefix} {device.code}</span>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>

        <form onSubmit={submit}>
          <div style={{ background: "#f0fdf9", border: "1px solid #ccfbf1", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "#0f766e" }}>
            <span dangerouslySetInnerHTML={{
              __html: t.borrowLocation
                .replace("{locker}", device.locker_id || "L01")
                .replace("{available}", availableMax)
                .replace("{unit}", displayUnit)
            }} />
          </div>

          <div className="form-grid" style={{ marginTop: 0 }}>
            <label>
              {t.borrowerLabel}
              <input
                value={formData.borrower}
                onChange={e => setFormData({ ...formData, borrower: e.target.value })}
                placeholder={t.borrowerPlaceholder}
                required
              />
            </label>

            <label>
              {t.classLabel}
              <input
                value={formData.borrowerClass}
                onChange={e => setFormData({ ...formData, borrowerClass: e.target.value })}
                placeholder={t.classPlaceholder}
                required
              />
            </label>

            <label>
              {t.phoneLabel}
              <input
                value={formData.borrowerPhone}
                onChange={e => setFormData({ ...formData, borrowerPhone: e.target.value })}
                placeholder={t.phonePlaceholder}
              />
            </label>

            <label>
              {t.borrowQtyLabel} (Max: {availableMax} {displayUnit})
              <input
                type="number"
                min="1"
                max={availableMax}
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: Math.min(availableMax, Math.max(1, Number(e.target.value) || 1)) })}
                required
              />
            </label>

            <label>
              {t.borrowTimeInput}
              <input
                type="datetime-local"
                value={formData.borrowTime}
                onChange={e => setFormData({ ...formData, borrowTime: e.target.value })}
                required
              />
            </label>

            <label>
              {t.expectedReturnTimeInput}
              <input
                type="datetime-local"
                value={formData.expectedReturnTime}
                onChange={e => setFormData({ ...formData, expectedReturnTime: e.target.value })}
                required
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              {t.notesLabel}
              <input
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t.notesPlaceholder}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>{tc.cancel}</button>
            <button type="submit" className="primary-btn">
              <Check size={14}/> {t.confirmBorrowBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReturnModal({ device, onConfirm, onClose, lang = "vi" }) {
  const t = translations[lang]?.devices || translations.vi.devices;
  const tc = translations[lang]?.common || translations.vi.common;
  const isEn = lang === "en";

  const displayName = isEn ? (device.nameEn || device.name) : device.name;
  const [actualReturnTime, setActualReturnTime] = useState(getLocalIsoString(new Date()));

  const isOverdue = device.expectedReturnTime && new Date(actualReturnTime) > new Date(device.expectedReturnTime);

  function submit(e) {
    e.preventDefault();
    onConfirm({ actualReturnTime });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: "520px" }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>{t.returnModalTitle.replace("{name}", displayName)}</h3>
            <span className="code-pill" style={{ marginTop: "4px" }}>{tc.codePrefix} {device.code}</span>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>

        <form onSubmit={submit}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px", marginBottom: "16px", fontSize: "11px" }}>
            <p style={{ margin: "0 0 8px", color: "#334155" }}>
              <span dangerouslySetInnerHTML={{
                __html: t.returnBorrowerInfo
                  .replace("{borrower}", device.borrower || "")
                  .replace("{className}", device.borrowerClass || "")
                  .replace("{time}", formatDateTime(device.borrowTime, lang))
              }} />
            </p>
            <p style={{ margin: "0 0 8px", color: "#334155" }}>
              <span dangerouslySetInnerHTML={{
                __html: t.returnExpectedInfo.replace("{time}", formatDateTime(device.expectedReturnTime, lang))
              }} />
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
              {isOverdue ? (
                <span className="overdue-tag">
                  <Clock3 size={11}/> {t.returnStatusOverdue}
                </span>
              ) : (
                <span className="ontime-tag">
                  <Check size={11}/> {t.returnStatusOnTime}
                </span>
              )}
              <span style={{ fontSize: "10px", color: "#64748b" }}>
                {t.returnLocation.replace("{locker}", device.locker_id || "L01")}
              </span>
            </div>
          </div>

          <label style={{ display: "block", fontSize: "10px", fontWeight: "600", color: "#334155" }}>
            {t.actualReturnTimeInput}
            <input
              type="datetime-local"
              style={{ display: "block", width: "100%", marginTop: "8px", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "11px" }}
              value={actualReturnTime}
              onChange={e => setActualReturnTime(e.target.value)}
              required
            />
          </label>

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>{tc.cancel}</button>
            <button type="submit" className="primary-btn">
              <Check size={14}/> {t.confirmReturnBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// PAGE: REPORTS & EXPORT
// ==========================================
function ReportsPage({ bookings, lockerLogs, entryLogs, lockers, devices, lang = "vi" }) {
  const t = translations[lang]?.reports || translations.vi.reports;
  const tc = translations[lang]?.common || translations.vi.common;
  const tcat = translations[lang]?.categories || translations.vi.categories;

  const borrowedDevices = devices.filter(d => d.borrower || d.status === "Đang sử dụng" || d.status === "Đang mượn").length;

  const categories = useMemo(() => {
    const unique = Array.from(new Set(devices.map(d => d.category).filter(Boolean)));
    return unique.length ? unique : [
      "Thiết bị chế tạo",
      "Bộ kít lập trình",
      "Thiết bị điện tử",
      "Dụng cụ chế tạo",
      "Linh kiện điện tử",
      "Vật tư tiêu hao"
    ];
  }, [devices]);

  return (
    <>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.desc}
        action={
          <button className="secondary-btn" onClick={() => window.print()}>
            <FileSpreadsheet size={15}/> {t.printBtn}
          </button>
        }
      />

      <div className="stats-grid">
        <Stat icon={CalendarDays} label={t.statBookings} value={bookings.length} hint={t.statBookingsHint} tone="blue"/>
        <Stat icon={Archive} label={t.statLockerLogs} value={lockerLogs.length} hint={t.statLockerLogsHint} tone="green"/>
        <Stat icon={Camera} label={t.statCameraLogs} value={entryLogs.length} hint={t.statCameraLogsHint} tone="purple"/>
        <Stat icon={Package} label={t.statBorrowed} value={borrowedDevices} hint={t.statBorrowedHint.replace("{total}", devices.length)} tone="orange"/>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>{t.chartTitle}</h3>
              <p>{t.chartDesc}</p>
            </div>
            <Package size={18} className="muted"/>
          </div>

          <div className="chart-bar-container">
            {categories.map(cat => {
              const count = devices.filter(d => d.category === cat).length;
              const percent = devices.length ? Math.round((count / devices.length) * 100) : 0;
              return (
                <div className="chart-row" key={cat}>
                  <div className="chart-label">{tcat[cat] || cat}</div>
                  <div className="chart-track">
                    <div className="chart-fill" style={{ width: `${percent}%` }}/>
                  </div>
                  <div className="chart-val">{count} {tc.itemsUnit}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>{t.exportTitle}</h3>
              <p>{t.exportDesc}</p>
            </div>
            <Download size={18} className="muted"/>
          </div>

          <div style={{ display: "grid", gap: "10px", marginTop: "15px" }}>
            <a href={api.getExportCsvUrl("bookings")} download className="secondary-btn" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
              <CalendarDays size={16}/> {t.exportBookings}
            </a>
            <a href={api.getExportCsvUrl("devices")} download className="secondary-btn" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
              <Package size={16}/> {t.exportDevices}
            </a>
            <a href={api.getExportCsvUrl("locker-logs")} download className="secondary-btn" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
              <Archive size={16}/> {t.exportLockers}
            </a>
            <a href={api.getExportCsvUrl("entry-logs")} download className="secondary-btn" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
              <Camera size={16}/> {t.exportCamera}
            </a>
          </div>

          <div className="info-callout" style={{ marginTop: "18px" }}>
            {t.exportCallout}
          </div>
        </section>
      </div>
    </>
  );
}

// ==========================================
// MODAL: SWITCH USER / AUTH
// ==========================================
function AuthModal({ currentUser, onSelectUser, onClose, lang = "vi" }) {
  const t = translations[lang]?.auth || translations.vi.auth;
  const tc = translations[lang]?.common || translations.vi.common;
  const tr = translations[lang]?.roles || translations.vi.roles;
  const isEn = lang === "en";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t.title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <p style={{ fontSize: "11px", color: "#667788", margin: "0 0 16px" }}>
          {t.desc}
        </p>
        <div style={{ display: "grid", gap: "10px" }}>
          {mockUsers.map(u => (
            <div
              key={u.id}
              onClick={() => onSelectUser(u)}
              style={{
                border: u.id === currentUser.id ? "2px solid #168e7e" : "1px solid #dce4ed",
                background: u.id === currentUser.id ? "#eff9f6" : "white",
                borderRadius: "10px",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer",
                transition: "all .15s"
              }}
            >
              <div className="avatar" style={{ background: u.role === "admin" ? "#d7eee9" : "#e8f1ff", color: u.role === "admin" ? "#147a6b" : "#397ad1" }}>
                {u.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: "12px", color: "#17283d" }}>{u.name}</b>
                <span style={{ display: "block", fontSize: "10px", color: "#78889a" }}>
                  {isEn ? (u.departmentEn || u.department) : u.department}
                </span>
              </div>
              <span className={`status-pill ${u.role === "admin" ? "approved" : "pending"}`}>
                {tr[u.role] || u.role}
              </span>
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>{tc.close}</button>
        </div>
      </div>
    </div>
  );
}
