# 波段计算器 交接文档

> 写给下一个完全没有上下文的 Claude 会话。读完这份文档就能上手。
> 最后更新：2026-09-30

---

## 这个项目是什么

**波段计算器（SwingCalc）** 是给普通用户用的股票波段交易记账工具。记录每一笔买入/卖出，用移动加权平均成本法算出持仓均价、已落袋利润和收益率。不联网，数据完全存在本机。

**目标用户：** 开发者的妈妈。Windows 电脑，不懂技术。所有界面文案都要让电脑小白看得懂。

**形态：** Node.js 本地服务器 + 单文件 HTML 界面，用 `pkg` 打包成一个 Windows exe。双击 exe → 自动打开浏览器 → 在浏览器里用。

> 历史：最早做过 iOS 版（SwiftUI）和纯网页版（localStorage），都已放弃并删除。iOS 版的问题是免费签名每 7 天要重签；网页版的问题是换浏览器数据就丢。

---

## 目录结构

```
/Users/a1/Desktop/SwingCalc/
├── HANDOFF.md                  本文档
└── SwingCalc-桌面版/
    ├── SwingCalc.html          完整应用：CSS + 核心算法 + 界面，全在一个文件里
    ├── server.js               本地服务器：提供页面、读写数据文件
    ├── package.json            pkg 打包配置（assets 里必须有 SwingCalc.html）
    ├── package-lock.json
    ├── build.sh                一键打包脚本
    ├── node_modules/           只有 pkg，打包要用，别删
    ├── tests/
    │   ├── run_core.py         算法 + 备份编解码检查（20 项）
    │   ├── core_checks.mjs     上面那个的断言内容
    │   └── ui_e2e.py           界面端到端检查（无头 Chromium）
    ├── 使用说明.md              给妈妈看的操作手册（随 exe 一起发）
    └── dist/
        └── 波段计算器.exe       交付物（约 36MB，Windows x64，无需安装 Node）
```

---

## 功能一览

**三个页面（底部 Tab）**
- **持仓**：顶部「当前波段 / 已归档」切换（有归档时才出现）
  - 当前波段：4 张数字卡（已落袋利润 / 持仓成本 / 浮动盈亏 / 总盈亏）+ 每轮波段一张卡片，宽屏网格排列
  - 已归档：累计落袋利润 / 整体收益率 / 已完成轮数 + 每轮一张卡片（起止日期、利润、收益率、归档时剩余股数）
- **流水**：全部交易记录。搜索（代码/名称/备注）+ 买卖方向 + 时间（全部 / 近1个月 / 近3个月 / 今年 / 自定义）。宽屏时左筛选、右列表
- **设置**：默认费率、导入导出（JSON / CSV）、数据文件位置、计算方式说明

**波段详情页**（点持仓页的卡片进入），按用户原来的 Excel 表格设计：
- 顶部 4 张数字卡：已落袋利润 / 收益率 / 剩余持仓 / 持仓均价
- 一行解释：卖出均价 − 买入均价 = 每股价差 × 卖出股数 = 利润（多轮买卖时改成文字说明）
- 左买右卖两张表（≥1100px 并排，否则上下）：日期 / 数量 / 单价 / 成交额 / 税费 / 实付或到手金额，合计行标黄显示数量和均价
- 点任意一行可编辑/删除
- 当前波段：可填现价看浮动盈亏；底部「📁 归档」按钮
- 已归档：只读提示条，没有「添加」和现价；底部「取消归档」按钮

**界面用词（用户指定，不要改回去）**
- 不说「标的」，说「波段」（每张卡是一轮完整的买入到卖出）
- 不说「存为历史」，说「归档」；切换按钮「当前波段 / 已归档」；撤销叫「取消归档」
- 代码里的变量名仍然是 archive / hist，没改

---

## 数据

**数据文件位置**（`server.js` 的 `pickDefaultDataFile()`）
- Windows：`D:\SwingCalc\data.json`
  - 先真的在 D 盘建目录、写探测文件；失败（没有 D 盘、光驱、只读）就退回 `C:\Users\<用户名>\Documents\SwingCalc\data.json`
  - 旧版数据在 Documents、D 盘还没有时，启动时自动复制到 D 盘，旧文件保留不删
- macOS：`~/Documents/SwingCalc/data.json`（本机测试时写的就是这里）

**文件格式**
```json
{
  "trades": [
    { "id": "...", "code": "512170", "name": "医疗ETF", "side": "buy",
      "price": 0.311, "quantity": 200100, "feeRate": 0.00005,
      "date": "ISO 时间", "createdAt": "ISO 时间", "note": null,
      "archiveId": "可选", "archivedAt": "可选" }
  ],
  "quotes": { "512170": { "price": 0.34, "at": "ISO 时间" } },
  "fee": 0.0003
}
```
- `archiveId` + `archivedAt` 成对出现，**没有 = 当前波段**。所以旧数据不需要任何迁移
- `quotes` 是用户手动填的现价，只对当前波段有意义

**服务器 API**：`GET/POST /api/data`（POST 先写 .tmp 再改名，原子写入）、`GET/POST /api/datapath`（读/改数据路径）

**备份**：JSON 导出版本号 2.1，导出导入都带 archiveId/archivedAt；CSV 末尾多了这两列。1.x 和 2.0 的旧备份仍然能导入。

---

## 核心算法（不要改错）

`SwingCalc.html` 里 `// ── app ──` 之前是核心算法段（从 iOS 版 Swift 逐行移植），之后是界面代码。

**移动加权平均成本法**（`position(code, trades)`）
- 买入：成本 += 成交额 + 手续费
- 卖出：按当时均价结转成本，落袋 += 到手金额 − 结转成本
- 排序键 `(date, sideRank, createdAt, id)`，**同一天买入必须排在卖出前面**，否则会误报超卖
- 全函数，不抛错：非法记录、超卖通过 `diagnostics` 上报，界面显示 ⚠️
- 返回值除持仓/均价/落袋外，还有 `buyGross/buyNet/sellGross/sellNet/avgBuyPrice/avgSellPrice/realizedCost/realizedRate/multiRound`

**跟用户确认过的口径**（用户原来的 Excel 和这里不一样，是有意为之）
- 买入税费**加进**成本（Excel 里是减，错的）
- 收益率 = 已落袋利润 ÷ 卖出那部分的买入成本（Excel 里是 ÷ 卖出金额）
- 用户那组数据：本应用利润 15,274.85 / 收益率 9.10%，Excel 是 15,291.64 / 8.35%

**波段划分**（界面代码里的 `rounds()`）
- 当前波段 = 没有 archiveId 的交易，按代码合并
- 每个 archiveId 单独算一轮
- 归档：给该代码所有当前交易打上同一个 archiveId，同时删掉该代码的现价
- 取消归档：该代码已有当前交易时拒绝（否则两轮会合并算错）
- 编辑已归档的交易时保留 archiveId

---

## 踩过的坑，绝对不要再踩

### 坑 1（致命）：C 命名空间
核心算法和界面代码合并在同一个 `<script type="module">` 里。界面代码通过 `C.xxx` 调用算法，所以两段之间必须有 `const C = { ... }` 把所有导出的函数/常量列进去（现在大约在第 738 行）。
- **新增核心函数时，一定要加进 `const C`**，否则调用时是 `ReferenceError`：保存按钮永远灰、设置页渲染到一半就停
- 只给 `position()` 的返回值加字段就不用改 `C`

### 坑 2：load() 是 async
启动必须是 `(async () => { await load(); switchTab(0); })();`，否则页面在数据加载前就渲染，显示为空。

### 坑 3：改完 HTML 必须重新打包
pkg 把 `SwingCalc.html` 打进 exe（`package.json` 的 `pkg.assets` 必须列出它）。只改 HTML 不打包，exe 里还是旧界面。

### 坑 4：DATA_FILE / DATA_DIR 是函数
`server.js` 里为了支持运行时改路径，两者都是 `() => ...`，要写 `DATA_FILE()`。

### 坑 5：全平仓时整体结转成本
卖出数量 ≥ 持仓时必须 `costOut = costBook; quantity = 0; costBook = 0;`，不能用 `(costBook / quantity) * effQty`，否则浮点误差会留下幽灵持仓。

### 坑 6：不能用 fmtPrice / fmtQty 回填输入框
它们带千位分隔符（`Number("1,650")` 是 NaN），而且会截断精度。回填输入框一律用 `fmtEditable`。

### 坑 7：日期一律按本地日历
`inDateRange` 和 `ymd()` 按本地时间取整到天。用 UTC 会让东八区用户的区间整体偏 8 小时。

### 坑 8：file:// 下很多 API 不能用
直接双击 HTML 走的是 localStorage 降级模式，只适合调试。正式使用必须经 `server.js`（`http://127.0.0.1`）。

---

## 还没解决的问题

1. **设置页「更改数据位置」有 bug，暂时别让用户用**
   - 改完路径会删掉旧文件；但重启后又回到默认的 D 盘路径 → 看起来数据没了（其实在新位置）
   - 修法：把路径写进 exe 旁边或用户目录下的 `config.json`，启动时读取；同时考虑改成复制而不是移动
2. **归档时剩余的股数不带到新一轮**（等用户决定）
   - 现在：没卖完的股数留在已归档那一轮；新一轮从 0 开始。之后如果卖掉这部分，新一轮会报「卖出超过持仓」
   - 备选：归档时把剩余股数按原均价作为新一轮的起始持仓
3. **还没在真实 Windows 上测过**：到目前为止都是在 Mac 上用无头 Chromium 测的（Edge 也是 Chromium 内核）
4. 可选：exe 图标还是 Node 默认图标；页面引用的 `icon180.png` / `manifest.json` 服务器没有提供（404，不影响使用）
5. 可选：重复双击 exe 会起两个服务器写同一个文件，可以改成检测到已运行就只打开浏览器

---

## 常用命令

```bash
cd ~/Desktop/SwingCalc/SwingCalc-桌面版

# 本地运行（会读写 ~/Documents/SwingCalc/data.json）
node server.js

# 测试
python3 tests/run_core.py    # 算法 + 备份编解码，20 项
python3 tests/ui_e2e.py      # 界面端到端，用假数据，不碰真实数据文件；截图在 /tmp/t_*.png
# 注：ui_e2e 里「近1个月」那一项依赖当天日期（写的时候是 2026-09-30），日期变了要调整测试数据

# 重新打包 Windows exe（改完 HTML 或 server.js 后必须做）
./node_modules/.bin/pkg . --target node18-win-x64 --output dist/波段计算器.exe --compress GZip
# 或者 ./build.sh
```

**用户的工作习惯**
- 用中文交流，提问也要用中文
- 删除文件要先列清单确认，移到废纸篓而不是直接删
