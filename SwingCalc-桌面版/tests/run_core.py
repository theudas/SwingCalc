"""算法 + 备份编解码检查：从 SwingCalc.html 抽出核心算法段，拼上 core_checks.mjs 用 node 跑。
用法：python3 tests/run_core.py"""
import pathlib, subprocess, sys, tempfile
here = pathlib.Path(__file__).resolve().parent
s = (here.parent / 'SwingCalc.html').read_text(encoding='utf-8')
a = s.index('<script type="module">') + len('<script type="module">')
b = s.index('// ── app ──')
code = s[a:b].replace('export ', '') + (here / 'core_checks.mjs').read_text(encoding='utf-8')
with tempfile.NamedTemporaryFile('w', suffix='.mjs', delete=False, encoding='utf-8') as f:
    f.write(code)
sys.exit(subprocess.call(['node', f.name]))
