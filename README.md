# 🎨 DrawChain

DrawChain is a real-time, multiplayer drawing and guessing game built with a horizontally scalable, production-grade architecture. Players can register, track their stats, climb a global leaderboard, create rooms, and play guessing matches in real-time.

#### 🚀 **[Play Live Demo](https://drawchain.logiclane.online/)**

<p align="center">
  <img src="public/screenshots/landing.png" width="45%" alt="Landing Page" />
  <img src="public/screenshots/gameplay.png" width="45%" alt="Gameplay" />
</p>
<p align="center">
  <img src="public/screenshots/join-game.png" width="45%" alt="Join Game" />
  <img src="public/screenshots/setup-game.png" width="45%" alt="Setup Game" />
</p>

---

## 🏗️ Core Architecture & Engineering Highlights

*   **Stateless WebSockets & Redis Cache (Upstash)**: Ephemeral game rooms and player state records are stored in serverless Redis instead of local Node.js memory. This makes the WebSocket server stateless and **horizontally scalable** (can run behind a load balancer) while allowing active rooms to survive server crashes and support player reconnection.
*   **Database Persistence (PostgreSQL & Prisma)**: Leverages Prisma ORM to manage user schemas, game statistics (wins, points, win-rates, high scores), and historical match records.
*   **NextAuth.js Authentication (Credentials & OAuth)**: Integrated email-and-password sign-in alongside **Google and GitHub OAuth** social logins. Configured automatic account linking to merge accounts with matching email addresses, and lifecycle event hooks to automatically register statistic records for new social logins.
*   **Drawing Network Optimization**: Implement client-side coordination batching and flattening. Instead of emitting a packet on every pixel movement (up to 100+ packets/sec), coordinate points are throttled and dispatched every 30ms in a lightweight flat integer array (`[x1, y1, x2, y2, ...]`). This decreases WebSocket frame congestion by **over 75%** and reduces payload bandwidth by **over 50%**.
*   **Robust Game Loop Design**: Implemented state-machine guards on all asynchronous server-side interval timers (lobby countdowns, drawing rounds) to eliminate race conditions, preventing background ticks from prematurely ending rounds or skipping turns.
*   **CI/CD Automation**: A GitHub Actions pipeline automatically validates ESLint rules, TypeScript compile-time type safety (`npx tsc --noEmit`), and Next.js production builds on every push and pull request.

---

## 🛠️ Tech Stack

*   **Frontend**: [Next.js](https://nextjs.org/) (React), [TailwindCSS](https://tailwindcss.com/), Patrick Hand custom typography.
*   **Backend**: Node.js, [Socket.io](https://socket.io/), [Prisma](https://www.prisma.io/)
*   **Database**: PostgreSQL (Neon Cloud Provider)
*   **Cache / State Store**: Redis (Upstash Serverless Redis)
*   **Language**: TypeScript
*   **CI/CD**: GitHub Actions

---

## 🚀 Getting Started

Follow these steps to run the project locally.

### 1. Prerequisites
*   Node.js (v20 or higher)
*   A running PostgreSQL instance (or Neon DB URL)
*   An Upstash Redis Database (or local Redis)

### 2. Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/PankajKumar-11/DrawChain-.git
    cd DrawChain-
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```

### 3. Environment Configuration
Create a `.env` file in the root directory and populate it with the following:
```env
# PostgreSQL Database (e.g. Neon, Supabase, Local)
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-32-character-secret-key"

# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL="https://your-redis-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"

# OAuth Credentials (Optional: Leave empty to disable)
GITHUB_ID="your-github-oauth-client-id"
GITHUB_SECRET="your-github-oauth-client-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
```

### 4. Push Database Schema
Sync your PostgreSQL database with the Prisma schema:
```bash
npx prisma db push
```

### 5. Run local development
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🎮 Game Rules & UX Details

1.  **Lobby and Configuration**: The host creates a room and configures round count and draw timers. Friends join using the 6-character room code.
2.  **Dynamic Word Hints**: Guessers see the secret word masked. At **60%** and **30%** time remaining during a drawing round, the system reveals random letters (e.g. `_ e _ _ _ _ a _ _`) and alerts the chat to help guessers solve difficult words.
3.  **Creative Tools**: The drawer has access to a Pencil (with **natural canvas paper sound feedback**), Eraser, Paint Fill Bucket, Color Swatches, and a complete Undo/Redo canvas history stack.
4.  **Points and Leaderboard**: Points are awarded to guessers based on speed (timeLeft ratio), and the drawer receives points when others guess correctly. Registered players receive profile stats updates and climb the global Leaderboard.

---

## 🤝 Contributing
Feel free to open issues or submit pull requests to improve the drawing engine, styles, or add new features!

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
