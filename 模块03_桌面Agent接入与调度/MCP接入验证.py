import argparse
import json
import os
from contextvars import ContextVar
from hmac import compare_digest
from uuid import uuid4

from 模块01_拼图核心.拼图核心 import Puzzle
from 模块02_三方视野与通信.三方视野与通信 import Collaboration


class SeatSmokeTest:
    def __init__(self, log):
        # 每次启动建立新棋盘。读取和移动复用同一局状态和同一轮编号。
        self._game = Puzzle()
        self._collaboration = Collaboration(self._game)
        self._round = uuid4().hex
        self._log = log

    def _record(self, seat, tool, args, result):
        # JSONL 每行是一条工具调用。立刻写盘，退出进程后仍可检查。
        event = {"round": self._round, "seat": seat, "tool": tool, "args": args, "result": result}
        self._log.write(json.dumps(event, ensure_ascii=False) + "\n")
        self._log.flush()
        return result

    def observe(self, seat="A"):
        # HTTP 入口从凭证确定席位。工具调用者无需传入席位。
        return self._record(seat, "read_view", {}, self._collaboration.observe(seat))

    def move(self, dx, dy, *, seat="A"):
        # 复用游戏核心的权限、碰撞与边界检查，并记录失败的移动。
        try:
            self._game.move(seat, dx, dy)
        except ValueError as exc:
            result = {"ok": False, "error": str(exc)}
        else:
            result = {"ok": True, "piece": self._collaboration.observe(seat)["pieces"][seat]}
        return self._record(seat, "move_piece", {"dx": dx, "dy": dy}, result)


def create_app(session, tokens):
    # SDK 负责 MCP 协议。把依赖放在这里导入，纯规则测试可独立运行。
    from mcp.server.fastmcp import FastMCP
    from starlette.responses import PlainTextResponse

    # 兼容已验证的 A 席位启动方式。每个凭证必须唯一，避免身份映射歧义。
    if isinstance(tokens, str):
        tokens = {"A": tokens}
    if (not tokens or set(tokens) - set("ABC") or not all(tokens.values())
            or len(set(tokens.values())) != len(tokens)):
        raise ValueError("席位必须为 A、B 或 C，且凭证必须非空、互不相同")
    expected = {seat: f"Bearer {token}".encode("ascii") for seat, token in tokens.items()}
    # 上下文变量只在当前请求中保存身份，并发请求不会覆盖彼此的席位。
    request_seat = ContextVar("request_seat")
    server = FastMCP("蒙德里安席位接入验证", stateless_http=True, json_response=True)

    @server.tool()
    async def read_view() -> dict:
        """读取当前席位的局部视野。"""
        return session.observe(request_seat.get())

    @server.tool()
    async def move_piece(dx: int, dy: int) -> dict:
        """移动当前席位的碎片。dx 向右为正，dy 向下为正。"""
        return session.move(dx, dy, seat=request_seat.get())

    app = server.streamable_http_app()

    async def authenticated_app(scope, receive, send):
        # HTTP 请求先查凭证，再交给 SDK。生命周期事件直接传给 SDK。
        if scope["type"] != "http":
            await app(scope, receive, send)
            return
        auth = [value for key, value in scope["headers"] if key == b"authorization"]
        seat = next((seat for seat, header in expected.items()
                     if len(auth) == 1 and compare_digest(auth[0], header)), None)
        if seat is None:
            response = PlainTextResponse("需要有效的席位凭证", status_code=401)
            await response(scope, receive, send)
            return
        context = request_seat.set(seat)
        try:
            await app(scope, receive, send)
        finally:
            # 每次请求结束都清理身份，包括 SDK 抛出异常时。
            request_seat.reset(context)

    return authenticated_app


if __name__ == "__main__":
    import uvicorn

    # 凭证由启动环境传入，日志路径由调用者指定。两者都不写入 Git。
    parser = argparse.ArgumentParser(description="启动 MCP 席位隔离验证")
    parser.add_argument("--log", required=True)
    args = parser.parse_args()
    # B、C 未配置时可继续验证 A。三席位联调时为三者分别设置凭证。
    tokens = {seat: os.environ[f"MONDRIAN_SEAT_{seat}_TOKEN"] for seat in "ABC"
              if os.environ.get(f"MONDRIAN_SEAT_{seat}_TOKEN")}
    if not tokens:
        parser.error("请至少设置一个席位凭证，例如 MONDRIAN_SEAT_A_TOKEN")
    with open(args.log, "a", encoding="utf-8") as log:
        # 只监听本机，供同一电脑上的 WorkBuddy 调用。
        uvicorn.run(create_app(SeatSmokeTest(log), tokens), host="127.0.0.1", port=8765)
