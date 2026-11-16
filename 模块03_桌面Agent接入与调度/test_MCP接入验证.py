import io
import json
import unittest
from importlib.util import find_spec

from .MCP接入验证 import SeatSmokeTest, create_app


class SeatSmokeTests(unittest.TestCase):
    @unittest.skipUnless(find_spec("mcp"), "安装 MCP SDK 后运行协议验证")
    def test_three_mcp_clients_finish_one_isolated_game(self):
        # 用三个独立凭证走真实 MCP 工具协议，模拟客户端依次完成一整局。
        from starlette.testclient import TestClient
        from .MCP接入验证 import SeatScheduledGame
        from 模块05_实验记录与对照.实验演示 import 脚本回复

        log = io.StringIO()
        tokens = {seat: f"test-{seat}" for seat in "ABC"}
        with TestClient(create_app(SeatScheduledGame(log), tokens),
                        base_url="http://127.0.0.1:8765") as client:
            def call(seat, name, arguments):
                response = client.post("/mcp", headers={
                    "Accept": "application/json, text/event-stream",
                    "Authorization": f"Bearer {tokens[seat]}",
                }, json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": name, "arguments": arguments}})
                self.assertEqual(response.status_code, 200)
                result = response.json()["result"]
                self.assertFalse(result.get("isError", False))
                return json.loads(result["content"][0]["text"])

            self.assertEqual(call("B", "next_puzzle_turn", {}), {"status": "waiting"})
            for turn in range(9):
                seat = "ABC"[turn % 3]
                job = call(seat, "next_puzzle_turn", {})
                view = job["observation"]
                self.assertEqual(set(view), {"seat", "board", "pieces", "clue", "messages"})
                self.assertEqual(view["seat"], seat)
                self.assertEqual(view["clue"]["for_seat"], "BCA"[turn % 3])
                submission = {"request_id": job["request_id"],
                              "reply": 脚本回复(view, True)}
                if turn == 0:
                    self.assertEqual(call("B", "submit_puzzle_turn", submission)["status"], "rejected")
                    self.assertEqual(call("A", "next_puzzle_turn", {}), job)
                receipt = call(seat, "submit_puzzle_turn", submission)
                self.assertTrue(receipt["result"]["ok"])
                self.assertEqual(call(seat, "submit_puzzle_turn", submission)["status"], "rejected")
            self.assertEqual(call("A", "next_puzzle_turn", {}), {"status": "finished"})
        records = [json.loads(line) for line in log.getvalue().splitlines()]
        self.assertEqual(len(records), 9)
        self.assertTrue(records[-1]["solved"])

    def test_a_reads_moves_and_records_the_round(self):
        # 同一份棋盘用于读取和移动。核对其它碎片以及逐行日志。
        log = io.StringIO()
        session = SeatSmokeTest(log)
        before = session.observe()
        self.assertEqual(before["seat"], "A")
        self.assertEqual(before["clue"]["for_seat"], "B")
        self.assertTrue(session.move(3, 0)["ok"])
        after = session.observe()
        self.assertEqual(after["pieces"]["A"]["x"], 3)
        for seat in ("B", "C"):
            self.assertEqual(before["pieces"][seat], after["pieces"][seat])
        read, move, _ = map(json.loads, log.getvalue().splitlines())
        self.assertEqual(read["result"], before)
        self.assertEqual(move["round"], read["round"])
        self.assertEqual(move["args"], {"dx": 3, "dy": 0})
        self.assertEqual(move["result"]["piece"]["x"], 3)

    def test_invalid_move_is_logged_and_does_not_move(self):
        # 即使动作失败，仍保留输入和失败结果。
        log = io.StringIO()
        session = SeatSmokeTest(log)
        session.observe()
        self.assertFalse(session.move(-1, 0)["ok"])
        self.assertEqual(session.observe()["pieces"]["A"]["x"], 0)
        self.assertFalse(json.loads(log.getvalue().splitlines()[1])["result"]["ok"])

    @unittest.skipUnless(find_spec("mcp"), "安装 MCP SDK 后运行协议验证")
    def test_http_auth_and_mcp_tool_calls(self):
        # 通过真实 SDK 的 ASGI 入口验证凭证和工具调用，无需启动桌面应用。
        from starlette.testclient import TestClient

        app = create_app(SeatSmokeTest(io.StringIO()), "test-only")
        headers = {"Accept": "application/json, text/event-stream",
                   "Authorization": "Bearer test-only"}
        request = {"jsonrpc": "2.0", "id": 1, "method": "tools/call"}
        # 使用与实机相同的主机名，保留 SDK 默认的 Host 检查。
        with TestClient(app, base_url="http://127.0.0.1:8765") as client:
            self.assertEqual(client.post("/mcp", json=request).status_code, 401)
            for name, args in (("read_view", {}), ("move_piece", {"dx": 3, "dy": 0})):
                request["params"] = {"name": name, "arguments": args}
                response = client.post("/mcp", headers=headers, json=request)
                self.assertEqual(response.status_code, 200)
                result = response.json()["result"]
                self.assertFalse(result.get("isError", False))
                # 这个 SDK 版本把普通字典放在文本内容中。
                payload = json.loads(result["content"][0]["text"])
                if name == "read_view":
                    self.assertEqual(payload["seat"], "A")
            self.assertEqual(payload["piece"]["x"], 3)

    @unittest.skipUnless(find_spec("mcp"), "安装 MCP SDK 后运行协议验证")
    def test_three_credentials_share_board_but_receive_different_clues(self):
        # 使用同一个端点，交替验证三个凭证身份和各自可见的线索。
        from starlette.testclient import TestClient

        tokens = {"A": "test-a", "B": "test-b", "C": "test-c"}
        log = io.StringIO()
        app = create_app(SeatSmokeTest(log), tokens)
        with TestClient(app, base_url="http://127.0.0.1:8765") as client:
            def call(seat, tool, args):
                # 将凭证放在请求头，工具参数不参与席位认证。
                response = client.post("/mcp", headers={
                    "Accept": "application/json, text/event-stream",
                    "Authorization": f"Bearer {tokens[seat]}",
                }, json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": tool, "arguments": args}})
                self.assertEqual(response.status_code, 200)
                return response.json()["result"]

            for seat, clue in zip("ABC", "BCA"):
                view = json.loads(call(seat, "read_view", {})["content"][0]["text"])
                self.assertEqual((view["seat"], view["clue"]["for_seat"]), (seat, clue))
                self.assertEqual(view["messages"], [])
            # 即使调用参数声称是 B，也不能移动 B 的碎片。
            call("A", "move_piece", {"dx": 3, "dy": 0, "seat": "B"})
            view = json.loads(call("C", "read_view", {})["content"][0]["text"])
            self.assertEqual(view["pieces"]["B"]["x"], 0)
            self.assertEqual(view["pieces"]["C"]["x"], 0)
            # 再执行合法移动，确认另一个席位能看到公共棋盘更新。
            current_x = view["pieces"]["A"]["x"]
            if current_x == 0:
                call("A", "move_piece", {"dx": 3, "dy": 0})
            view = json.loads(call("B", "read_view", {})["content"][0]["text"])
            self.assertEqual(view["pieces"]["A"]["x"], 3)
        self.assertEqual([json.loads(line)["seat"] for line in log.getvalue().splitlines()[:3]],
                         ["A", "B", "C"])
