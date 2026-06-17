# Chess ELO Server

Backend ELO cho game cờ Unity. Node.js + Express + PostgreSQL.
Thuật toán ELO chạy **server-side** (client không tự sửa rating được).

## API

| Method | Path | Body | Mô tả |
|---|---|---|---|
| GET  | `/health` | — | Kiểm tra sống |
| POST | `/auth/anon` | `{ deviceId, displayName }` | Tìm-hoặc-tạo người chơi theo thiết bị → trả `{ id, display_name, rating, games, ... }` |
| GET  | `/player/:id` | — | Lấy thông tin 1 người chơi |
| POST | `/match/report` | `{ matchId, whiteId, blackId, result }` | `result` = `white_win` \| `black_win` \| `draw`. Tính ELO, ghi rating. Idempotent theo `matchId` |
| GET  | `/leaderboard?limit=20` | — | Top theo rating |

ELO: khởi điểm **1000**, K = **32** (dưới 20 ván) → **16**.

---

## 1) Tạo Database (Neon — free, không cần thẻ)

1. Đăng ký tại https://neon.tech (đăng nhập bằng GitHub).
2. Tạo project → vào **Connection Details** → copy **Connection string** (dạng `postgres://...?sslmode=require`).

## 2) Chạy thử ở máy (local)

```bash
cd chess-elo-server
npm install
cp .env.example .env          # Windows: copy .env.example .env
# Sửa .env: dán DATABASE_URL từ Neon
npm start
```
Mở http://localhost:3000/health → thấy `{"ok":true}` là chạy.

Test nhanh (PowerShell):
```powershell
# Tạo 2 người chơi
curl -Method POST http://localhost:3000/auth/anon -Body '{"deviceId":"dev-A","displayName":"Alice"}' -ContentType "application/json"
curl -Method POST http://localhost:3000/auth/anon -Body '{"deviceId":"dev-B","displayName":"Bob"}'   -ContentType "application/json"
# Lấy 2 id ở trên, rồi report 1 ván Alice (white) thắng:
curl -Method POST http://localhost:3000/match/report -Body '{"matchId":"m1","whiteId":"<ID_A>","blackId":"<ID_B>","result":"white_win"}' -ContentType "application/json"
# Xem bảng xếp hạng
curl http://localhost:3000/leaderboard
```

## 3) Deploy lên Render (free, không cần thẻ)

1. Đẩy thư mục này lên 1 repo GitHub **riêng** (không chung với repo Unity):
   ```bash
   cd chess-elo-server
   git init && git add . && git commit -m "chess elo server"
   # tạo repo trên GitHub rồi:
   git remote add origin https://github.com/<you>/chess-elo-server.git
   git push -u origin main
   ```
2. Vào https://render.com → **New +** → **Web Service** → nối repo vừa tạo.
3. Cấu hình:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Tab **Environment** → thêm biến:
   - `DATABASE_URL` = connection string của Neon
   - (Không cần đặt `PORT` — Render tự cấp)
5. **Create Web Service** → đợi deploy. Xong sẽ có URL dạng `https://chess-elo-server-xxxx.onrender.com`.
6. Mở `https://...onrender.com/health` → `{"ok":true}` là OK.

> ⚠️ Bản free của Render **ngủ sau ~15 phút** không dùng → request đầu chờ ~30–60s rồi mới chạy. Bình thường với test bạn bè.

## Ghi chú thiết kế
- Rating gắn vào `players.id` (UUID), tách khỏi cách đăng nhập (`auth_identities`).
  Sau này thêm login email/Google = thêm dòng `auth_identities` trỏ về cùng `player_id` → **không mất rating**.
- `matches.match_id` là PRIMARY KEY → cùng 1 ván report 2 lần (cả 2 client) chỉ tính 1 lần.
- MVP: tin tưởng client báo kết quả (đủ cho chơi với bạn bè). Nâng cấp chống gian lận sau:
  yêu cầu cả 2 client báo và khớp nhau, hoặc server tự kiểm chứng ván.
