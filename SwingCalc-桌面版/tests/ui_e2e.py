"""界面端到端检查：无头 Chromium 打开 SwingCalc.html，/api/data 用内存假数据（不碰真实数据文件）。
从旧格式数据开始，走一遍 归档 → 新一轮 → 取消归档被拦 → 编辑已归档交易 → 流水时间筛选。
截图输出到 /tmp/t_*.png。用法：python3 tests/ui_e2e.py（需要 Python 版 playwright）"""
import json
from playwright.sync_api import sync_playwright
import pathlib, sys
html=(pathlib.Path(__file__).resolve().parent.parent/'SwingCalc.html').read_text(encoding='utf-8')
def mk(i,side,date,q,p,code='512170',name='医疗ETF'): return dict(id=f'x{i}',code=code,name=name,side=side,date=date+'T00:30:00.000Z',createdAt=date+'T00:30:00.000Z',quantity=q,price=p,feeRate=0.00005)
# 旧版格式：没有 archiveId / archivedAt
T=[mk(1,'buy','2026-05-28',200100,0.311),mk(2,'buy','2026-06-04',500000,0.303),mk(3,'sell','2026-07-24',200000,0.332),mk(4,'sell','2026-07-15',100000,0.332),mk(5,'sell','2026-07-20',150000,0.32),mk(6,'sell','2026-08-14',200000,0.356),
   mk(7,'buy','2026-09-10',1000,15.2,'600519','某股票')]
store={'d':json.dumps(dict(trades=T,quotes={'512170':{'price':0.34,'at':'2026-09-01T00:00:00Z'}},fee=0.00005))}
errs=[]; dialogs=[]
def route(r):
  u=r.request.url
  if '/api/data' in u:
    if r.request.method=='POST': store['d']=r.request.post_data; return r.fulfill(body='{"ok":true}',content_type='application/json')
    return r.fulfill(body=store['d'],content_type='application/json')
  if '/api/datapath' in u: return r.fulfill(body='{"path":"D:\\\\SwingCalc\\\\data.json"}',content_type='application/json')
  if u.endswith('/'): return r.fulfill(body=html,content_type='text/html; charset=utf-8')
  r.fulfill(status=404)
def ok(n,c):
  print(('✓ ' if c else '✗ ')+n)
  if not c: errs.append('FAIL '+n)
with sync_playwright() as pw:
  b=pw.chromium.launch(); pg=b.new_page(viewport=dict(width=1400,height=950))
  pg.on('pageerror',lambda e: errs.append(str(e)))
  pg.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
  pg.route('**/*',route); pg.goto('http://127.0.0.1:9/'); pg.wait_for_timeout(500)
  txt=pg.inner_text('#v-pos')
  ok('旧数据：两个标的都在当前', '医疗ETF' in txt and '某股票' in txt)
  ok('旧数据：没有历史切换（还没存过）', pg.query_selector('#posmode') is None)
  ok('旧数据：医疗ETF 剩 100 股', '100 股' in txt)
  pg.screenshot(path='/tmp/t_home_wide.png')
  pg.click('.pos[data-code="512170"]'); pg.wait_for_timeout(300)
  pg.screenshot(path='/tmp/t_detail.png')
  pg.click('#darch'); pg.wait_for_timeout(400)
  ok('确认框提到剩余 100 股', any('100 股' in m for m in dialogs))
  d=json.loads(store['d'])
  arch=[t for t in d['trades'] if t.get('archiveId')]
  ok('6 笔医疗ETF都打上历史标记', len(arch)==6 and all(t['code']=='512170' for t in arch))
  ok('医疗ETF 的旧现价已清掉', '512170' not in d['quotes'])
  ok('其它字段没被改动', all({k:v for k,v in t.items() if k not in('archiveId','archivedAt')}==o for t,o in zip(d['trades'],T)))
  ok('存完自动切到历史页', '已归档汇总' in pg.inner_text('#v-pos'))
  pg.screenshot(path='/tmp/t_hist.png')
  pg.click('#posmode button[data-v="cur"]'); pg.wait_for_timeout(200)
  ok('当前页只剩某股票', '医疗ETF' not in pg.inner_text('#v-pos') and '某股票' in pg.inner_text('#v-pos'))
  # 新一轮医疗ETF
  pg.click('#add'); pg.wait_for_timeout(200)
  pg.fill('#f-code','512170'); pg.fill('#f-name','医疗ETF'); pg.fill('#f-price','0.3'); pg.fill('#f-qty','50000')
  pg.click('#esave'); pg.wait_for_timeout(300)
  cur=pg.inner_text('#v-pos')
  ok('新一轮医疗ETF 从 50,000 股开始', '50,000 股' in cur)
  pg.click('.pos[data-code="512170"]'); pg.wait_for_timeout(300)
  ok('新一轮只有 1 笔买入、落袋为 0', '1 笔' in pg.inner_text('.ledgers') and '0.00' in pg.inner_text('.kpis'))
  pg.click('#dx'); pg.click('#posmode button[data-v="hist"]'); pg.wait_for_timeout(200)
  pg.click('.pos[data-aid]:not([data-aid=""])'); pg.wait_for_timeout(300)
  ok('历史详情没有“添加”和现价', pg.query_selector('#dadd') is None and pg.query_selector('#cur') is None)
  dialogs.clear(); pg.click('#dunarch'); pg.wait_for_timeout(300)
  ok('已有新一轮时恢复被拦住', any('不能取消归档' in m for m in dialogs) and len([t for t in json.loads(store['d'])['trades'] if t.get('archiveId')])==6)
  # 在历史里改一笔：仍属历史
  pg.click('tr.lr >> nth=0'); pg.wait_for_timeout(200); pg.fill('#f-note','改过'); pg.click('#esave'); pg.wait_for_timeout(300)
  x1=[t for t in json.loads(store['d'])['trades'] if t['id']=='x1'][0]
  ok('修改历史里的交易后仍属于那一轮', bool(x1.get('archiveId')) and x1['note']=='改过')
  # 流水页
  pg.click('#t1'); pg.wait_for_timeout(300)
  ok('流水里历史交易带「历史」标签', pg.query_selector('.tag') is not None)
  ok('流水里默认没有日期框', pg.query_selector('#v-tx input[type=date]') is None)
  pg.screenshot(path='/tmp/t_tx_wide.png')
  pg.click('#rangef button[data-v="1m"]'); pg.wait_for_timeout(200)
  n1=pg.inner_text('.txmain')
  ok('近1个月：只剩 9 月的两笔', '筛选结果（2 笔）' in n1)
  pg.click('#rangef button[data-v="custom"]'); pg.wait_for_timeout(200)
  vals=[pg.input_value('#from'),pg.input_value('#to')]
  ok('自定义：两个日期都已预填 '+str(vals), all(vals) and vals[0]=='2026-05-28')
  pg.screenshot(path='/tmp/t_tx_custom.png')
  # 导出/导入往返
  pg.set_viewport_size(dict(width=820,height=1000)); pg.click('#t0'); pg.wait_for_timeout(300)
  pg.screenshot(path='/tmp/t_hist_mid.png')
  pg.click('#posmode button[data-v="cur"]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/t_cur_mid.png')
  pg.click('#t1'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/t_tx_mid.png')
  pg.set_viewport_size(dict(width=1400,height=950)); pg.click('#add'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/t_editor.png')
  b.close()
print('errors:',errs)
sys.exit(1 if errs else 0)
