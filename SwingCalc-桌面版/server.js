/**
 * SwingCalc 本地服务器
 *
 * 启动后监听 localhost 上一个随机端口，并自动打开浏览器。
 * 数据存在本机固定路径：
 *   Windows: D:\SwingCalc\data.json（没有 D 盘或 D 盘不可写时退回到"文档"目录）
 *   macOS:   ~/Documents/SwingCalc/data.json
 */

'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const net  = require('net');
const { exec } = require('child_process');

// ── 路径配置（运行时可变）──────────────────────────────────
// 旧版默认位置，也是没有 D 盘时的退路
const LEGACY_DATA_FILE = path.join(os.homedir(), 'Documents', 'SwingCalc', 'data.json');
const WIN_D_DATA_FILE  = 'D:\\SwingCalc\\data.json';

// Windows 默认存 D 盘。不能只看 D:\ 在不在：它可能是光驱或只读盘，
// 所以真的建一次目录、写一次探测文件，失败就退回"文档"目录。
function pickDefaultDataFile() {
  if (process.platform !== 'win32') return LEGACY_DATA_FILE;
  try {
    const dir = path.dirname(WIN_D_DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-test');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
  } catch {
    console.log('D 盘不可用，数据改存到：' + LEGACY_DATA_FILE);
    return LEGACY_DATA_FILE;
  }
  // 从旧版升级：D 盘还没有数据、旧位置有，就复制过来。旧文件保留作备份，不删。
  if (!fs.existsSync(WIN_D_DATA_FILE) && fs.existsSync(LEGACY_DATA_FILE)) {
    try {
      fs.copyFileSync(LEGACY_DATA_FILE, WIN_D_DATA_FILE);
      console.log('已把旧数据复制到 D 盘（原文件保留）：' + LEGACY_DATA_FILE);
    } catch (e) {
      console.log('复制旧数据失败，继续使用旧位置：' + e.message);
      return LEGACY_DATA_FILE;
    }
  }
  return WIN_D_DATA_FILE;
}

const DEFAULT_DATA_FILE = pickDefaultDataFile();
let dataFile = DEFAULT_DATA_FILE;
const DATA_DIR  = () => path.dirname(dataFile);
const DATA_FILE = () => dataFile;
// pkg 打包后 __dirname 指向快照文件系统，assets 可直接读取
const HTML_PATH = path.join(__dirname, 'SwingCalc.html');

// ── 工具函数 ──────────────────────────────────────────────
function ensureDataDir() {
  const dir = DATA_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readHtml() {
  try {
    return fs.readFileSync(HTML_PATH, 'utf8');
  } catch (e) {
    return `<h1>无法读取 SwingCalc.html</h1><pre>${e.message}</pre>`;
  }
}

// 先写 .tmp 再原子改名，避免写入中途断电损坏数据文件
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function findFreePort(preferred, callback) {
  const s = net.createServer();
  s.listen(preferred, '127.0.0.1', () => {
    const port = s.address().port;
    s.close(() => callback(port));
  });
  s.on('error', () => findFreePort(preferred + 1, callback));
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.error('无法自动打开浏览器，请手动访问：', url); });
}

function readBody(req, callback) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => callback(Buffer.concat(chunks).toString('utf8')));
  req.on('error', () => callback(null));
}

// ── HTTP 服务器 ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  const { method, url } = req;

  // CORS：只接受 localhost 来源，浏览器正常访问不会触发 CORS
  res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${server.address()?.port ?? ''}`);

  // GET /  → 主页面
  if (method === 'GET' && (url === '/' || url === '/index.html')) {
    const html = readHtml();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // GET /api/data → 读取数据文件
  if (method === 'GET' && url === '/api/data') {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE())) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end('null');
    }
    try {
      const data = fs.readFileSync(DATA_FILE(), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/data → 写入数据文件
  if (method === 'POST' && url === '/api/data') {
    readBody(req, (body) => {
      if (body === null) { res.writeHead(400); return res.end('bad request'); }
      try { JSON.parse(body); }
      catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '数据不是合法的 JSON' }));
      }
      try {
        ensureDataDir();
        atomicWrite(DATA_FILE(), body);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, path: DATA_FILE() }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /api/datapath → 当前数据文件路径
  if (method === 'GET' && url === '/api/datapath') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ path: DATA_FILE() }));
  }

  // POST /api/datapath → 更改数据文件路径（同时迁移数据）
  // body: { "path": "/new/absolute/path/to/data.json" }
  if (method === 'POST' && url === '/api/datapath') {
    readBody(req, (body) => {
      if (body === null) { res.writeHead(400); return res.end('bad request'); }
      let newPath;
      try { newPath = JSON.parse(body).path; } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '请求格式不对' }));
      }
      if (!newPath || typeof newPath !== 'string' || !path.isAbsolute(newPath)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '必须是绝对路径' }));
      }
      // 路径没变就直接返回
      if (path.normalize(newPath) === path.normalize(DATA_FILE())) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true, path: DATA_FILE() }));
      }
      try {
        const oldFile = DATA_FILE();
        // 目标目录不存在则创建
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        // 把旧数据复制到新路径（旧文件存在时）
        if (fs.existsSync(oldFile)) {
          fs.copyFileSync(oldFile, newPath);
        }
        // 切换路径
        dataFile = newPath;
        // 删除旧文件（复制成功后才删）
        if (fs.existsSync(oldFile) && path.normalize(oldFile) !== path.normalize(newPath)) {
          fs.unlinkSync(oldFile);
        }
        console.log(`数据路径已更改为：${dataFile}`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, path: dataFile }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 其他路径 → 404
  res.writeHead(404);
  res.end('not found');
});

// ── 启动 ─────────────────────────────────────────────────
findFreePort(58380, (port) => {
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`波段计算器已启动：${url}`);
    console.log(`数据文件：${DATA_FILE()}`);
    setTimeout(() => openBrowser(url), 300);
  });
});

// ── 退出处理 ─────────────────────────────────────────────
process.on('SIGINT', () => { console.log('\n已退出。'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
