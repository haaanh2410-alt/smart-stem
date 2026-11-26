import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import http from "node:http";
import url from "node:url";
import { db, initDatabase } from "./database.js";

const PORT = process.env.PORT || 5000;

await initDatabase();

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    return res.end();
  }

  try {
    // ----------------------------------------------------
    // AUTHENTICATION
    // ----------------------------------------------------
    if (pathname === "/api/auth/login" && method === "POST") {
      const { username, password } = await parseBody(req);
      const { rows } = await db.query(
        "SELECT id, username, name, role, department FROM users WHERE username = $1 AND password = $2",
        [username, password]
      );
      const user = rows[0];
      if (!user) {
        return sendJson(res, 401, { success: false, message: "Sai tên đăng nhập hoặc mật khẩu" });
      }
      return sendJson(res, 200, { success: true, user, token: `token_${user.id}_${Date.now()}` });
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer token_(\d+)_/);
      if (match) {
        const userId = Number(match[1]);
        const { rows } = await db.query("SELECT id, username, name, role, department FROM users WHERE id = $1", [userId]);
        if (rows[0]) return sendJson(res, 200, { success: true, user: rows[0] });
      }
      return sendJson(res, 401, { success: false, message: "Chưa đăng nhập" });
    }

    if (pathname === "/api/users" && method === "GET") {
      const { rows } = await db.query("SELECT id, username, name, role, department, created_at FROM users");
      return sendJson(res, 200, { success: true, users: rows });
    }

    // ----------------------------------------------------
    // STATS / SUMMARY
    // ----------------------------------------------------
    if (pathname === "/api/stats/summary" && method === "GET") {
      const bookingsCount = Number((await db.query("SELECT COUNT(*) as count FROM bookings")).rows[0].count);
      const pendingCount = Number((await db.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'Chờ duyệt'")).rows[0].count);
      const lockers = (await db.query("SELECT * FROM lockers")).rows;
      const openLockers = lockers.filter(l => l.state === "open").length;
      const entryCount = Number((await db.query("SELECT COUNT(*) as count FROM entry_logs")).rows[0].count);
      const devicesCount = Number((await db.query("SELECT COUNT(*) as count FROM devices")).rows[0].count);
      const borrowedDevices = Number((await db.query("SELECT COUNT(*) as count FROM devices WHERE status = 'Đang sử dụng'")).rows[0].count);

      return sendJson(res, 200, {
        success: true,
        stats: {
          totalBookings: bookingsCount,
          pendingBookings: pendingCount,
          totalLockers: lockers.length,
          openLockers,
          entryEvents: entryCount,
          totalDevices: devicesCount,
          borrowedDevices
        }
      });
    }

    // ----------------------------------------------------
    // BOOKINGS
    // ----------------------------------------------------
    if (pathname === "/api/bookings" && method === "GET") {
      const { rows } = await db.query("SELECT * FROM bookings ORDER BY id DESC");
      const parsed = rows.map(b => ({
        ...b,
        periods: JSON.parse(b.periods || "[]")
      }));
      return sendJson(res, 200, { success: true, bookings: parsed });
    }

    if (pathname === "/api/bookings" && method === "POST") {
      const { name, className, date, session, periods, purpose } = await parseBody(req);
      const requestedPeriods = (Array.isArray(periods) ? periods : [periods]).map(Number).filter(Number.isInteger);

      if (!name?.trim() || !date || !["morning", "afternoon"].includes(session) || requestedPeriods.length === 0) {
        return sendJson(res, 400, { success: false, message: "Vui lòng điền đầy đủ thông tin đăng ký." });
      }

      const { rows: existing } = await db.query(
        "SELECT * FROM bookings WHERE date = $1 AND session = $2 AND status != 'Từ chối'",
        [date, session]
      );

      const conflict = existing.some(b => {
        let bookedPeriods = [];
        try { bookedPeriods = JSON.parse(b.periods || "[]"); } catch { return false; }
        return bookedPeriods.some(p => requestedPeriods.includes(Number(p)));
      });

      if (conflict) {
        return sendJson(res, 409, { success: false, message: "Tiết học này đã có người đăng ký." });
      }

      const { rows } = await db.query(
        `INSERT INTO bookings (name, class_name, date, session, periods, purpose, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Chờ duyệt') RETURNING *`,
        [name.trim(), (className || "Khách tham quan").trim(), date, session, JSON.stringify(requestedPeriods), purpose || "Học tập và thực hành STEM"]
      );

      const created = rows[0];
      created.periods = JSON.parse(created.periods || "[]");

      return sendJson(res, 201, { success: true, booking: created, message: "Đăng ký thành công, đang chờ duyệt." });
    }

    const bookingStatusMatch = pathname.match(/^\/api\/bookings\/(\d+)\/status$/);
    if (bookingStatusMatch && method === "PUT") {
      const bookingId = Number(bookingStatusMatch[1]);
      const { status } = await parseBody(req);
      if (!["Chờ duyệt", "Đã duyệt", "Từ chối"].includes(status)) {
        return sendJson(res, 400, { success: false, message: "Trạng thái không hợp lệ" });
      }
      await db.query("UPDATE bookings SET status = $1, updated_at = TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = $2", [status, bookingId]);
      return sendJson(res, 200, { success: true, message: `Đã cập nhật trạng thái thành "${status}"` });
    }

    const bookingDeleteMatch = pathname.match(/^\/api\/bookings\/(\d+)$/);
    if (bookingDeleteMatch && method === "DELETE") {
      const bookingId = Number(bookingDeleteMatch[1]);
      await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
      return sendJson(res, 200, { success: true, message: "Đã xóa yêu cầu đăng ký" });
    }

    // ----------------------------------------------------
    // LOCKERS & SENSORS
    // ----------------------------------------------------
    if (pathname === "/api/lockers" && method === "GET") {
      const { rows } = await db.query("SELECT * FROM lockers ORDER BY id ASC");
      return sendJson(res, 200, { success: true, lockers: rows });
    }

    const lockerUpdateMatch = pathname.match(/^\/api\/lockers\/([a-zA-Z0-9_-]+)$/);
    if (lockerUpdateMatch && (method === "PUT" || method === "POST")) {
      const lockerId = lockerUpdateMatch[1].toUpperCase();
      const body = await parseBody(req);
      const { rows } = await db.query("SELECT * FROM lockers WHERE id = $1", [lockerId]);
      const locker = rows[0];
      if (!locker) {
        return sendJson(res, 404, { success: false, message: "Không tìm thấy hộc tủ" });
      }

      const nextState = body.state || (locker.state === "open" ? "closed" : "open");
      const source = body.source || "Mô phỏng";
      const now = new Date();
      const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const dateStr = now.toLocaleDateString("vi-VN");

      await db.query("UPDATE lockers SET state = $1, updated_at = $2 WHERE id = $3", [nextState, timeStr, lockerId]);

      const eventName = nextState === "open" ? "Mở hộc tủ" : "Đóng hộc tủ";
      await db.query(
        "INSERT INTO locker_logs (locker_id, locker_name, event, source, time, date) VALUES ($1, $2, $3, $4, $5, $6)",
        [locker.id, locker.name, eventName, source, timeStr, dateStr]
      );

      const updated = (await db.query("SELECT * FROM lockers WHERE id = $1", [lockerId])).rows[0];
      return sendJson(res, 200, {
        success: true,
        locker: updated,
        message: `Đã cập nhật trạng thái ${locker.name}: ${nextState === "open" ? "Đang mở" : "Đang đóng"}`
      });
    }

    if (pathname === "/api/locker-logs" && method === "GET") {
      const { rows } = await db.query("SELECT * FROM locker_logs ORDER BY id DESC LIMIT 100");
      return sendJson(res, 200, { success: true, logs: rows });
    }

    // ----------------------------------------------------
    // CAMERA & ENTRY LOGS
    // ----------------------------------------------------
    if (pathname === "/api/entry-logs" && method === "GET") {
const { rows } = await db.query("SELECT * FROM entry_logs ORDER BY id DESC LIMIT 100");
return sendJson(res, 200, { success: true, logs: rows });
}
if (pathname === "/api/entry-logs" && method === "POST") {
const { direction, label, count, camera } = await parseBody(req);
const now = new Date();
const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateStr = now.toLocaleDateString("vi-VN");
const { rows } = await db.query(
"INSERT INTO entry_logs (direction, label, count, camera, time, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
[
direction || "in",
label || (direction === "out" ? "Phát hiện người đi ra" : "Phát hiện người đi vào"),
Number(count) || 1,
camera || "Camera phòng STEM",
timeStr,
dateStr
]
);
return sendJson(res, 201, { success: true, log: rows[0] });
}
// ----------------------------------------------------
// DEVICES MANAGEMENT
// ----------------------------------------------------
if (pathname === "/api/devices" && method === "GET") {
const { rows } = await db.query("SELECT * FROM devices ORDER BY id ASC");
return sendJson(res, 200, { success: true, devices: rows });
}
if (pathname === "/api/devices" && method === "POST") {
const { code, name, category, locker_id, quantity, description } = await parseBody(req);
if (!name || !category) {
return sendJson(res, 400, { success: false, message: "Tên thiết bị và danh mục là bắt buộc" });
}
let finalCode = code;
if (!finalCode) {
const last = (await db.query("SELECT id FROM devices ORDER BY id DESC LIMIT 1")).rows[0];
const nextId = (last?.id || 0) + 1;
finalCode = "STEM-" + String(nextId).padStart(3, "0");
}
try {
const q = Number(quantity) || 1;
const { rows } = await db.query(
"INSERT INTO devices (code, name, category, locker_id, quantity, available, status, description) VALUES ($1, $2, $3, $4, $5, $6, 'Sẵn sàng', $7) RETURNING *",
[finalCode, name, category, locker_id || "L01", q, q, description || ""]
);
return sendJson(res, 201, { success: true, device: rows[0], message: "Đã thêm thiết bị mới" });
} catch (err) {
if (err.code === "23505") {
return sendJson(res, 400, { success: false, message: "Mã thiết bị đã tồn tại" });
}
throw err;
}
}
const deviceEditMatch = pathname.match(/^/api/devices/(\d+)$/);
if (deviceEditMatch && method === "PUT") {
const deviceId = Number(deviceEditMatch[1]);
const { name, category, locker_id, quantity, available, status, description } = await parseBody(req);
const { rows } = await db.query(
UPDATE devices SET name = COALESCE($1, name), category = COALESCE($2, category), locker_id = COALESCE($3, locker_id), quantity = COALESCE($4, quantity), available = COALESCE($5, available), status = COALESCE($6, status), description = COALESCE($7, description) WHERE id = $8 RETURNING *,
[name, category, locker_id, quantity, available, status, description, deviceId]
);
return sendJson(res, 200, { success: true, device: rows[0], message: "Đã cập nhật thiết bị" });
}
if (deviceEditMatch && method === "DELETE") {
const deviceId = Number(deviceEditMatch[1]);
await db.query("DELETE FROM devices WHERE id = $1", [deviceId]);
return sendJson(res, 200, { success: true, message: "Đã xóa thiết bị khỏi danh mục" });
}
const deviceBorrowMatch = pathname.match(/^/api/devices/(\d+)/borrow$/);
if (deviceBorrowMatch && method === "POST") {
const deviceId = Number(deviceBorrowMatch[1]);
const { borrower } = await parseBody(req);
if (!borrower) return sendJson(res, 400, { success: false, message: "Vui lòng nhập tên người mượn" });
const dev = (await db.query("SELECT * FROM devices WHERE id = $1", [deviceId])).rows[0];
if (!dev) return sendJson(res, 404, { success: false, message: "Không tìm thấy thiết bị" });
if (dev.available <= 0) return sendJson(res, 400, { success: false, message: "Thiết bị này hiện đã được mượn hết" });
const newAvailable = dev.available - 1;
const newStatus = newAvailable === 0 ? "Đang sử dụng" : dev.status;
const today = new Date().toLocaleDateString("vi-VN");
const { rows } = await db.query(
"UPDATE devices SET available = $1, status = $2, borrower = $3, borrow_date = $4 WHERE id = $5 RETURNING *",
[newAvailable, newStatus, borrower, today, deviceId]
);
return sendJson(res, 200, { success: true, device: rows[0], message: Đã ghi nhận mượn thiết bị cho ${borrower} });
}
const deviceReturnMatch = pathname.match(/^/api/devices/(\d+)/return$/);
if (deviceReturnMatch && method === "POST") {
const deviceId = Number(deviceReturnMatch[1]);
const dev = (await db.query("SELECT * FROM devices WHERE id = $1", [deviceId])).rows[0];
if (!dev) return sendJson(res, 404, { success: false, message: "Không tìm thấy thiết bị" });
const newAvailable = Math.min(dev.quantity, dev.available + 1);
const newStatus = newAvailable > 0 ? "Sẵn sàng" : dev.status;
const { rows } = await db.query(
"UPDATE devices SET available = $1, status = $2, borrower = NULL, borrow_date = NULL WHERE id = $3 RETURNING *",
[newAvailable, newStatus, deviceId]
);
return sendJson(res, 200, { success: true, device: rows[0], message: "Đã hoàn trả thiết bị vào hộc tủ" });
}
// ----------------------------------------------------
// CSV EXPORT
// ----------------------------------------------------
if (pathname === "/api/export/csv" && method === "GET") {
const type = parsedUrl.query.type || "bookings";
let csvContent = "\uFEFF";
if (type === "bookings") {
csvContent += "ID,Người đăng ký,Lớp/Đơn vị,Ngày,Buổi,Tiết,Mục đích,Trạng thái,Thời gian tạo\n";
const { rows } = await db.query("SELECT * FROM bookings ORDER BY id DESC");
rows.forEach(r => {
let periods = "";
try { periods = JSON.parse(r.periods).join("; "); } catch { periods = r.periods; }
const sessionLabel = r.session === "morning" ? "Buổi sáng" : "Buổi chiều";
csvContent += "${r.id}","${r.name}","${r.class_name}","${r.date}","${sessionLabel}","${periods}","${r.purpose}","${r.status}","${r.created_at}"\n;
});
} else if (type === "devices") {
csvContent += "Mã TB,Phân loại,Thuộc mã bộ,Tên thiết bị,Danh mục,Vị trí hộc tủ,Tổng số lượng,Khả dụng,Đơn vị,Trạng thái,Người đang mượn,Ngày mượn\n";
const { rows } = await db.query("SELECT * FROM devices ORDER BY id ASC");
rows.forEach(r => {
csvContent += "${r.code}","${r.type || ''}","${r.parent_code || ''}","${r.name}","${r.category || ''}","${r.locker_id || ''}","${r.quantity}","${r.available}","${r.unit || ''}","${r.status}","${r.borrower || ''}","${r.borrow_date || ''}"\n;
});
} else if (type === "locker-logs") {
csvContent += "ID,Hộc tủ,Sự kiện,Nguồn,Thời gian,Ngày\n";
const { rows } = await db.query("SELECT * FROM locker_logs ORDER BY id DESC");
rows.forEach(r => {
csvContent += "${r.id}","${r.locker_name}","${r.event}","${r.source}","${r.time}","${r.date}"\n;
});
} else if (type === "entry-logs") {
csvContent += "ID,Thời gian,Ngày,Hướng,Mô tả,Số người,Camera\n";
const { rows } = await db.query("SELECT * FROM entry_logs ORDER BY id DESC");
rows.forEach(r => {
const dir = r.direction === "in" ? "Đi vào" : "Đi ra";
csvContent += "${r.id}","${r.time}","${r.date}","${dir}","${r.label}","${r.count}","${r.camera}"\n;
});
}
res.writeHead(200, {
"Content-Type": "text/csv; charset=utf-8",
"Content-Disposition": attachment; filename="smart_stem_${type}_${Date.now()}.csv",
"Access-Control-Allow-Origin": "*"
});
return res.end(csvContent);
}
// Phục vụ giao diện React (thư mục dist)
const distDir = path.join(__dirname, "../dist");
let filePath = path.join(distDir, pathname === "/" ? "index.html" : pathname);
if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
filePath = path.join(distDir, "index.html");
}
if (fs.existsSync(filePath)) {
const ext = path.extname(filePath);
const mimeTypes = {
".html": "text/html; charset=utf-8",
".js": "application/javascript; charset=utf-8",
".css": "text/css; charset=utf-8",
".svg": "image/svg+xml",
".png": "image/png",
".json": "application/json"
};
res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
return fs.createReadStream(filePath).pipe(res);
}
sendJson(res, 404, { success: false, message: Endpoint ${pathname} không tồn tại });
} catch (error) {
console.error("Server Error:", error);
sendJson(res, 500, { success: false, message: "Lỗi máy chủ nội bộ", error: error.message });
}
});
server.listen(PORT, "0.0.0.0", () => {
console.log([Smart STEM Backend] Server dang chay tai: http://localhost:${PORT});
console.log([Smart STEM Backend] Ket noi du lieu dam may: Supabase PostgreSQL);
});