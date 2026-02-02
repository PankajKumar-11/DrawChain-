# Cloud Deployment Guide (Render)

Since you have hosted your app on **Render**, here is how to connect your custom subdomain (`draw.logiclane.online` or similar).

## 1. Configure Render
1.  Go to your **Render Dashboard**.
2.  Click on your **DrawChain** project.
3.  Go to the **Settings** tab.
4.  Scroll down to the **Custom Domains** section.
5.  Click **Add Custom Domain**.
6.  Enter the full subdomain you want to use, for example:
    ```
    draw.logiclane.online
    ```
7.  Click **Save**. Render will now show you the DNS records you need to create.

## 2. Configure DNS (logiclane.online)
You need to log in to the website where you bought your domain (e.g., GoDaddy, Namecheap, Hostinger, Cloudflare).

1.  Find the **DNS Management** or **DNS Records** section for `logiclane.online`.
2.  Add a new record:
    *   **Type:** `CNAME`
    *   **Name (Host):** `draw` (or whatever subdomain you chose)
    *   **Value (Target):** `your-app-name.onrender.com` (Copy this exactly from the Render dashboard)
    *   **TTL:** Default / Automatic

## 3. Verify
1.  Wait a few minutes (sometimes up to an hour) for DNS to propagate.
2.  Render will automatically provision an SSL certificate (HTTPS) for you.
3.  Visit `https://draw.logiclane.online` to verify!

---

### Important: Environment Variables
Make sure your environment variables in Render match what you need for production.
-   `NODE_ENV`: `production`
