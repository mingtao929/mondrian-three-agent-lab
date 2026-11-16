import json
import tempfile
import unittest
from pathlib import Path

from .实验演示 import 导出, 运行实验


class 实验演示测试(unittest.TestCase):
    def test_先交换线索再通关(self):
        # 确认首次行动前已收到队友的线索，并且执行结果全部成功。
        实验 = 运行实验()
        self.assertTrue(实验["已通关"])
        回合 = 实验["回合"]
        self.assertEqual([轮["action"]["action"] for 轮 in 回合[:3]], ["chat"] * 3)
        self.assertEqual([轮["action"]["action"] for 轮 in 回合[3:6]], ["move"] * 3)
        self.assertTrue(all(轮["result"]["ok"] for 轮 in 回合))
        for 轮 in 回合[3:6]:
            self.assertTrue(any(json.loads(消息["text"])["for_seat"] == 轮["input"]["seat"]
                                for 消息 in 轮["input"]["messages"]))

    def test_不分享时脚本等待并保留记录(self):
        # 对照只约束脚本是否发言，公共聊天机制仍由同一模块提供。
        实验 = 运行实验(False)
        self.assertFalse(实验["已通关"])
        self.assertEqual(len(实验["回合"]), 12)
        self.assertTrue(all(轮["action"]["action"] == "wait" for 轮 in 实验["回合"]))

    def test_导出和席位回放对应同一回合(self):
        实验 = 运行实验()
        with tempfile.TemporaryDirectory() as 临时目录:
            目录 = Path(临时目录)
            导出(实验, 目录)
            行 = (目录 / "回合.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual([json.loads(记录) for 记录 in 行], 实验["回合"])
            页面 = (目录 / "01-A.html").read_text(encoding="utf-8")
            self.assertIn('href="01-B.html"', 页面)
            self.assertIn("A 的线索", 页面)
            self.assertIn('href="01-A.html"', (目录 / "回放.html").read_text(encoding="utf-8"))
