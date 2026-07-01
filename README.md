# SQL Arena — Client-Side SQL Playground & Frontend Database Sandbox

SQL Arena is an interactive SQL playground and database sandbox built entirely on frontend technologies. By combining client-side WebAssembly compilers with local file parsing libraries, it allows users to load spreadsheet datasets and execute queries directly in the browser—with zero database server overhead or backend API configurations.

This project serves as a showcase of bridging relational SQL databases with standard browser APIs and modern UI components.

---

## ⚡ Core Technical Architecture

*   **🌐 Browser-Compiled SQLite WASM**: Embeds a full SQLite engine inside the browser using WebAssembly. All queries run in-memory inside the client browser context, requiring no backend servers.
*   **📂 Client-Side File Parsing (CSV & Excel)**: Integrates `PapaParse` and `SheetJS` (`xlsx.full.min.js`) to read local files in JavaScript. The uploader automatically infers column data types (`INTEGER`, `REAL`, `TEXT`), generates SQLite tables, and commits rows dynamically.
*   **📊 Dynamic Charting Engine**: Uses `Chart.js` to map raw SQL query results directly into interactive, multi-series visualizations (bar, line, pie, polar charts) grouped by selected fields.
*   **💾 Persistent Browser Sandboxing**: Utilizes `localStorage` to save custom uploaded datasets, parsed schemas, and saved query tasks, restoring the complete database environment upon page refresh.
*   **🛡️ Session Simulation & Access Controls**: Features a simulated client-side authentication gate that dynamically adjusts SQL editor write access depending on the logged-in role (e.g. blocking typing for read-only roles).

---

## 🛠️ Technology Stack

*   **Database Engine**: SQLite WebAssembly compiler (`sql-wasm.js`)
*   **Excel Workbook Parser**: SheetJS JS-XLSX (`xlsx.full.min.js`)
*   **CSV Text Parser**: PapaParse (`papaparse.min.js`)
*   **Visualizations**: Chart.js
*   **Icons**: Lucide CDN
*   **Build Tool**: Vite

---

## 🚀 Local Installation & Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/SunilPrasannaVijayanV/SQL-Arena.git
    cd SQL-Arena
    ```

2.  **Install Node Dependencies**:
    ```bash
    npm install
    ```

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173/` in your browser.

---

## 🌐 Production Deployment

Since the application is 100% static client-side code, it can be hosted for free with high performance on Vercel or GitHub Pages.

### Option A: Deploying to Vercel (Recommended)
1. Sign up on **[Vercel](https://vercel.com/)** and link your GitHub account.
2. Click **"Add New"** → **"Project"** and import your `SQL-Arena` repository.
3. Vercel automatically configures the Vite build configuration. Click **"Deploy"**.
4. Your playground is live on a secure HTTPS `.vercel.app` domain!

### Option B: Deploying to GitHub Pages
1. Install the `gh-pages` development helper:
   ```bash
   npm install gh-pages --save-dev
   ```
2. Configure your repository base path in **[vite.config.js](file:///D:/PROJECT/SQL-PROJECTS-SANITIZED/vite.config.js)**:
   ```javascript
   import { defineConfig } from 'vite';
   export default defineConfig({
     base: '/SQL-Arena/'
   });
   ```
3. Add deployment configurations under scripts in **[package.json](file:///D:/PROJECT/SQL-PROJECTS-SANITIZED/package.json)**:
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d dist"
   ```
4. Build and publish your sandbox:
   ```bash
   npm run deploy
   ```
