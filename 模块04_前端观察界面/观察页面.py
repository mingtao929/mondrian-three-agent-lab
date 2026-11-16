from html import escape
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit

from 模块01_拼图核心.拼图核心 import Puzzle
from 模块02_三方视野与通信.三方视野与通信 import Collaboration


def render_page(view):
    # 每个棋盘格用 (x, y) 标识。把碎片信息转换为格子到所属席位的映射。
    width, height = view["board"]["width"], view["board"]["height"]
    occupied = {}
    for owner, piece in view["pieces"].items():
        x, y = piece["x"], piece["y"]
        occupied[x, y] = owner
        occupied[x + (not piece["vertical"]), y + piece["vertical"]] = owner

    # 按从左到右、从上到下的顺序输出格子。颜色之外也写出席位字母。
    cells = []
    for y in range(height):
        for x in range(width):
            owner = occupied.get((x, y), "")
            label = f"{owner} 碎片 ({x}, {y})" if owner else f"空格 ({x}, {y})"
            cells.append(f'<span class="格子 {owner}" aria-label="{label}">{owner}</span>')

    # 席位链接请求一份新的观察数据，页面只生成当前席位的一条线索。
    links = []
    for seat in "ABC":
        current = ' aria-current="page"' if seat == view["seat"] else ""
        links.append(f'<a href="/?seat={seat}"{current}>{seat}</a>')
    clue = view["clue"]
    target = clue["target"]
    direction = "竖放" if target["vertical"] else "横放"

    # 聊天来自 Agent。转义尖括号等字符后再插入 HTML。
    messages = [
        f'<li><b>{escape(message["sender"])}</b> {escape(message["text"])}</li>'
        for message in view["messages"]
    ]
    chat = f'<ol>{"".join(messages)}</ol>' if messages else '<p>暂无消息</p>'

    # 用 CSS 网格画棋盘，屏幕较窄时把线索面板移到棋盘下方。
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>蒙德里安几何狂想 · 观察台</title>
<style>
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:#f5f1e7; color:#191919; font:16px/1.6 "Geist","Microsoft YaHei",sans-serif }}
  main {{ width:min(1080px,94%); margin:3rem auto }}
  header {{ border-top:8px solid; padding:1rem 0; border-bottom:3px solid }}
  h1 {{ font-size:clamp(1.7rem,5vw,3rem); line-height:1.15; margin:0 0 .5rem }}
  h2 {{ margin:0 0 .65rem }}
  nav {{ display:flex; gap:.5rem; align-items:center; margin:1rem 0 }}
  nav a {{ color:inherit; border:2px solid; text-decoration:none; padding:.2rem .9rem }}
  nav [aria-current] {{ color:white; background:#191919; border-color:#191919 }}
  .布局 {{ display:grid; grid-template-columns:2fr 1fr; gap:1.5rem; align-items:start }}
  .棋盘 {{ display:grid; grid-template-columns:repeat({width},1fr); gap:3px; padding:3px; background:#191919 }}
  .格子 {{ display:grid; place-items:center; aspect-ratio:1; background:#fffdf7; font-weight:800 }}
  .A {{ background:#c63031; color:white }} .B {{ background:#f5c843 }} .C {{ background:#224a90; color:white }}
  aside {{ background:#fffdf7; border:3px solid; padding:1rem; overflow-wrap:anywhere }}
  @media(max-width:650px) {{ .布局 {{ grid-template-columns:1fr }} main {{ margin:1.4rem auto }} }}
</style></head><body><main>
<header><h1>蒙德里安几何狂想</h1><span>研究者观察台 · 演示棋盘</span></header>
<nav aria-label="切换席位">观察席位 {"".join(links)}</nav>
<div class="布局"><section><h2>公共棋盘</h2>
<div class="棋盘" role="group" aria-label="拼图棋盘">{"".join(cells)}</div>
</section><aside><h2>{view["seat"]} 的线索</h2>
<p>{clue["for_seat"]} 的目标坐标为 ({target["x"]}, {target["y"]})，{direction}。</p>
<hr><h2>公共聊天</h2>{chat}</aside></div></main></body></html>"""


def create_server(session, port=8767):
    # 观察者可以切换席位，所以这个入口只监听本机演示服务。
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            # 拆分 URL 路径和查询参数。无效席位返回 400。
            url = urlsplit(self.path)
            if url.path != "/":
                self.send_error(404)
                return
            seats = parse_qs(url.query, keep_blank_values=True).get("seat", ["A"])
            if len(seats) != 1 or seats[0] not in ("A", "B", "C"):
                self.send_error(400, "Invalid seat")
                return
            body = render_page(session.observe(seats[0])).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    return HTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    # 演示页创建独立棋盘，之后再从实验运行服务读实时数据。
    with create_server(Collaboration(Puzzle())) as server:
        print("观察页：http://127.0.0.1:8767", flush=True)
        server.serve_forever()
