# Deploying to the Cloud (Permanent Link)

If you want a link that works 24/7 (even when your PC is off), you need a cloud server.

### ⚠️ Important Note about "Vercel"
You might know Vercel is great for Next.js websites. **However, it is NOT GOOD for this game.**
*   **Why?** Vercel puts the server to "sleep" instantly when no one is clicking. This kills the game connection immediately.
*   **Solution:** We use **Render.com**. It keeps the server "awake" (in the free tier) much better for games.

---

## Part 1: Put your Code on GitHub
1.  Go to [GitHub.com](https://github.com/) and sign in.
2.  Click **(+) > New Repository**.
3.  Name it `drawchain` (Public).
4.  **Do NOT** initialize with README or license (leave empty).
5.  Click **Create repository**.
6.  Copy the commands under **"…or push an existing repository from the command line"**.
    *   They look like:
        ```bash
        git remote add origin https://github.com/YOUR_USER/drawchain.git
        git branch -M main
        git push -u origin main
        ```
7.  Open your Terminal (VS Code) and paste those commands!

## Part 2: Deploy to Render (Best Free Option)
1.  Go to [dashboard.render.com](https://dashboard.render.com/).
2.  Click **New + > Web Service**.
3.  Connect your GitHub account and select your `drawchain` repo.
4.  **Settings**:
    *   **Name**: `draw-chain-game` (or whatever)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build`
    *   **Start Command**: `npm run start`
    *   **Instance Type**: `Free`
5.  Click **Create Web Service**.

Wait about 3-5 minutes. Render will give you a link like `https://draw-chain-game.onrender.com`.
**That link works forever!** 🚀

> **Note on Render Free Tier:**
> The server "spins down" after inactivity. The first time you visit it after a while, it might take 50 seconds to load. Afterwards, it's fast!
