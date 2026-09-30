const mk=(side,date,qty,price,i)=>({id:'x'+i,code:'512170',name:'医疗ETF',side,date,createdAt:date,quantity:qty,price,feeRate:0.00005});
const T=[mk('buy','2026-05-28',200100,0.311,1),mk('buy','2026-06-04',500000,0.303,2),
mk('sell','2026-07-24',200000,0.332,3),mk('sell','2026-07-15',100000,0.332,4),mk('sell','2026-07-20',150000,0.32,5),mk('sell','2026-08-14',100000,0.356,6)];
const p=position('512170',T);
const r=(x,d)=>+x.toFixed(d);
const ok=(n,a,e)=>{const g=Math.abs(a-e)<1e-6;console.log(g?'✓':'✗',n,a,g?'':'期望 '+e);if(!g)process.exitCode=1};
ok('剩余',p.quantity,150100); ok('买入合计',p.totalBuyQuantity,700100); ok('卖出合计',p.totalSellQuantity,550000);
ok('卖出成交额',r(p.sellGross,2),183200); ok('卖出到手',r(p.sellNet,2),183190.84);
ok('买入成交额',r(p.buyGross,2),213731.1); ok('买入实付',r(p.buyNet,4),213741.7866);
ok('利润',r(p.realized,2),15274.85); ok('收益率%',r(p.realizedRate*100,2),9.10);
ok('利润=到手−结转成本',r(p.realized-(p.sellNet-p.realizedCost),8),0);
ok('单轮',+p.multiRound,0);
ok('价差×量=利润',r((p.avgSellPrice-p.avgBuyPrice)*p.totalSellQuantity-p.realized,6),0);
// 多轮：买→卖→再买
const q=position('A',[mk('buy','2026-01-01',100,10,1),mk('sell','2026-01-02',100,12,2),mk('buy','2026-01-03',100,20,3)].map(t=>({...t,code:'A',feeRate:0})));
ok('多轮标记',+q.multiRound,1); ok('多轮利润',q.realized,200); ok('多轮收益率',q.realizedRate,0.2);
const z=position('B',[mk('buy','2026-01-01',100,10,1)].map(t=>({...t,code:'B'})));
ok('未卖出收益率为null',+(z.realizedRate===null),1);
console.log(fmtSignedPercent(p.realizedRate), fmtPrice(p.avgBuyPrice), fmtPrice(p.avgSellPrice));

// 导出/导入往返：历史标记不能丢；旧备份（无标记）照常导入
const A=[{...T[0],archiveId:'r1',archivedAt:'2026-09-30T00:00:00Z'},T[1]];
const back=decodeBackup(encodeJSON(A));
ok('往返后历史标记保留',+(back[0].archiveId==='r1'&&back[0].archivedAt==='2026-09-30T00:00:00Z'),1);
ok('往返后当前记录仍无标记',+(back[1].archiveId===undefined),1);
const oldBackup=JSON.stringify({version:'2.1',records:[{id:'o1',code:'512170',side:'buy',price:0.3,quantity:100,feeRate:0,date:'2026-01-01T00:00:00Z'}]});
ok('旧版备份照常导入',+(decodeBackup(oldBackup)[0].archiveId===undefined),1);
ok('CSV 带历史列',+encodeCSV(A).split('\r\n')[1].endsWith('r1,2026-09-30T00:00:00Z'),1);
