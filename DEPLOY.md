# How to Play With Friends (Step-by-Step)

Since your game is running on your computer (`localhost`), friends on other networks can't see it yet. You need to create a **Tunnel** to the internet.

We will use **ngrok** (a free, legitimate tool) to give your PC a public URL.

## Step 1: Get Ngrok
1.  Go to [ngrok.com](https://ngrok.com/) and sign up for a free account.
2.  Download the **ngrok agent** for Windows.
3.  Unzip it (you can just drop `ngrok.exe` in your project folder or anywhere).
4.  Connect your account (copy the command from your ngrok dashboard, looks like `ngrok config add-authtoken ...`).

## Step 2: Start Your Game
Make sure your game is running locally (which it is, on port `3001` or `3002`).
Let's assume port **3001**.
1.  Keep your current terminal running `npm run dev`.

## Step 3: Go Public
1.  Open a **New Terminal** (Command Prompt or PowerShell) in VS Code.
2.  Run this command:
    ```powershell
    ngrok http 3001
    ```
    *(If your game is on 3002, use 3002)*

## Step 4: Share the Link
1.  Ngrok will show a URL that looks like: `https://abcd-123-456.ngrok-free.app`
2.  **Copy that URL.**
3.  Send it to your friends! 📩

## Step 5: Play!
-   **You**: Open that URL in your browser.
-   **Friends**: Open that URL in their browsers.
-   Everything should work exactly the same as localhost!

> **Note**: Because we are using the "Next.js API" server pattern, this works perfectly for temporary sessions. If you close your terminal, the server stops.

---

### Alternative: Deploy Permanently (Advanced)
If you want a link that works 24/7 without your computer being on, we need to deploy to a cloud provider like **Railway** or **Render**.
*This is more complex because we need to move the server code out of Next.js API routes into a custom server.*
**Let me know if you want to do this instead!**
