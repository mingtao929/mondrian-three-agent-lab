import unittest

from 模块01_拼图核心.拼图核心 import Puzzle
from 模块02_三方视野与通信.三方视野与通信 import Collaboration

from .观察页面 import render_page


class ObservationPageTests(unittest.TestCase):
    def test_seat_view_and_board(self):
        # 切换席位时，只渲染该席位的一条线索。
        session = Collaboration(Puzzle())
        page = render_page(session.observe("A"))
        self.assertIn('aria-current="page">A', page)
        self.assertIn("B 的目标", page)
        self.assertNotIn("C 的目标", page)
        self.assertEqual(page.count('class="格子 '), 28)
        self.assertIn("C 碎片 (0, 2)", page)

    def test_messages_are_escaped(self):
        # Agent 发送的 HTML 必须作为文本显示，不能被浏览器执行。
        session = Collaboration(Puzzle())
        session.send_message("B", "<script>alert(1)</script>")
        page = render_page(session.observe("C"))
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', page)
        self.assertNotIn('<script>', page)
