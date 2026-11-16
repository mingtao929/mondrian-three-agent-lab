"""用固定脚本跑通协作、记录和回放。适合作为真实 Agent 接入前的自检。"""

import argparse
import json
from pathlib import Path

from 模块01_拼图核心.拼图核心 import Puzzle
from 模块02_三方视野与通信.三方视野与通信 import Collaboration
from 模块03_桌面Agent接入与调度.轮次调度 import Scheduler
from 模块04_前端观察界面.观察页面 import render_page


def 脚本回复(视野, 允许分享):
    # 演示用 JSON 表达线索，接收方只从公共聊天查找自己的目标。
    席位 = 视野["seat"]
    聊天 = 视野["messages"]
    if 允许分享 and not any(消息["sender"] == 席位 for 消息 in 聊天):
        动作 = {"action": "chat", "text": json.dumps(视野["clue"])}
    else:
        线索 = next((json.loads(消息["text"]) for 消息 in 聊天
                   if json.loads(消息["text"])["for_seat"] == 席位), None)
        if 线索 is None:
            动作 = {"action": "wait"}
        else:
            # 先移动横放碎片，再旋转。坐标来自队友消息，当前位置来自公开棋盘。
            目标 = 线索["target"]
            碎片 = 视野["pieces"][席位]
            横移, 纵移 = 目标["x"] - 碎片["x"], 目标["y"] - 碎片["y"]
            if 横移 or 纵移:
                动作 = {"action": "move", "dx": 横移, "dy": 纵移}
            elif 碎片["vertical"] != 目标["vertical"]:
                动作 = {"action": "rotate"}
            else:
                动作 = {"action": "wait"}
    return json.dumps(动作, ensure_ascii=False)


def 运行实验(允许分享=True, 最大轮次=12):
    # 两种演示条件各用一局新棋盘。调度器的输入与回执原样保留。
    游戏 = Puzzle()
    会话 = Collaboration(游戏)
    接入函数 = {席位: lambda 视野: 脚本回复(视野, 允许分享) for 席位 in "ABC"}
    调度 = Scheduler(游戏, 会话, 接入函数)
    记录 = []
    for _ in range(最大轮次):
        回合 = 调度.step()
        # 回放记录每次行动后的三份快照，仅供研究者查看。
        回合["views_after"] = {席位: 会话.observe(席位) for 席位 in "ABC"}
        记录.append(回合)
        if 游戏.is_solved():
            break
    return {"分享线索": 允许分享, "已通关": 游戏.is_solved(), "回合": 记录}


def 导出(实验, 目录):
    # 把同一份记录分别写成可分析的 JSONL 和可离线打开的 HTML。
    目录.mkdir(parents=True, exist_ok=True)
    with (目录 / "回合.jsonl").open("w", encoding="utf-8") as 文件:
        for 回合 in 实验["回合"]:
            文件.write(json.dumps(回合, ensure_ascii=False) + "\n")
    (目录 / "摘要.json").write_text(
        json.dumps({"分享线索": 实验["分享线索"], "已通关": 实验["已通关"],
                    "总轮次": len(实验["回合"])}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    for 回合 in 实验["回合"]:
        for 席位, 视野 in 回合["views_after"].items():
            页码 = 回合["turn"]
            # 用同一观察页渲染器生成静态快照，把席位切换换成文件链接。
            页面 = render_page(视野).replace('href="/?seat=', f'href="{页码:02d}-')
            for 字母 in "ABC":
                页面 = 页面.replace(f'href="{页码:02d}-{字母}"', f'href="{页码:02d}-{字母}.html"')
            页脚 = f'<p>第 {页码} 轮执行后 · <a href="回放.html">回到轮次目录</a></p>'
            (目录 / f"{页码:02d}-{席位}.html").write_text(
                页面.replace("</main>", 页脚 + "</main>"), encoding="utf-8")
    链接 = "".join(
        f'<li>第 {轮["turn"]} 轮 · '
        + " ".join(f'<a href="{轮["turn"]:02d}-{席位}.html">{席位} 视野</a>' for 席位 in "ABC")
        + "</li>" for 轮 in 实验["回合"]
    )
    (目录 / "回放.html").write_text(
        f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>协作回放</title>'
        f'<h1>协作回放</h1><p>已通关：{"是" if 实验["已通关"] else "否"}</p><ol>{链接}</ol></html>',
        encoding="utf-8",
    )


if __name__ == "__main__":
    # 默认演示保留公共聊天。用单独的目录运行对照，避免覆盖上一场记录。
    参数 = argparse.ArgumentParser(description=__doc__)
    参数.add_argument("--输出", required=True, type=Path)
    参数.add_argument("--不分享", action="store_true", help="脚本角色在本次对照中不主动分享")
    选项 = 参数.parse_args()
    实验结果 = 运行实验(not 选项.不分享)
    导出(实验结果, 选项.输出)
    print(f'已通关：{实验结果["已通关"]}。回放：{选项.输出.resolve() / "回放.html"}')
