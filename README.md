# 蒙德里安几何狂想平台

从项目根目录打开对应的模块文件夹。每个模块的代码和测试放在一起。

第一次学习可以按[中文搭建与源码导读](docs/中文搭建与源码导读.md)依次运行五个模块。想先看完整效果，运行第五模块生成回放，再回到第一模块逐行阅读。

| 模块 | 代码或计划 |
| --- | --- |
| 01 拼图核心 | [实现](模块01_拼图核心/拼图核心.py) · [测试](模块01_拼图核心/test_拼图核心.py) |
| 02 三方视野与通信 | [实现](模块02_三方视野与通信/三方视野与通信.py) · [测试](模块02_三方视野与通信/test_三方视野与通信.py) |
| 03 桌面 Agent 接入与调度 | [轮次调度](模块03_桌面Agent接入与调度/轮次调度.py) · [调度测试](模块03_桌面Agent接入与调度/test_轮次调度.py) · [A 席位 MCP 验证](模块03_桌面Agent接入与调度/MCP接入验证.py) |
| 04 前端观察界面 | [观察页](模块04_前端观察界面/观察页面.py) · [测试](模块04_前端观察界面/test_观察页面.py) |
| 05 实验记录与对照 | [演示、记录与回放](模块05_实验记录与对照/实验演示.py) · [联动测试](模块05_实验记录与对照/test_实验演示.py) |

在项目根目录的 PowerShell 中运行：

```powershell
# 安装依赖后将运行 MCP 协议测试。无需配置真实 Agent 凭证。
python -m pip install -r requirements.txt

# 运行全部模块测试。
python -B -m unittest -v

# 模拟 A 向右移动三格并旋转，逐轮记录会写入 agent-test.jsonl。
'{"action":"move","dx":3,"dy":0}', '{"action":"rotate"}' | python -B -m 模块01_拼图核心.拼图核心 A 2> agent-test.jsonl
```

查看[产品设计文档](docs/产品设计文档.md)了解各模块的用途。

在项目根目录运行 `python -B -m 模块04_前端观察界面.观察页面`，打开 <http://127.0.0.1:8767> 查看演示棋盘、席位线索和公共聊天。按 Ctrl+C 停止服务。

第二模块在同一个棋盘上生成三个局部视野。各席位能看见公开碎片位置，并持有一条队友的目标线索，可在公共聊天中主动分享。接入协作会话时，平台应使用第二模块的 `observe()` 发送观察；第一模块的命令行入口用于单席位接入测试。

第三模块的 `Scheduler.step()` 执行一轮，返回视野、原始回复、解析后的动作和结果。现有测试用模拟回复验证收发流程。WorkBuddy 的 MCP 接入需要另外验证连接凭证和会话隔离。

运行 A 席位 MCP 验证需要安装 `mcp==1.30.0`。将随机凭证设为环境变量 `MONDRIAN_SEAT_A_TOKEN`，然后运行 `python -B -m 模块03_桌面Agent接入与调度.MCP接入验证 --log <日志路径>`。在 WorkBuddy 配置 Streamable HTTP 地址 `http://127.0.0.1:8765/mcp`，请求头 `Authorization` 使用 `Bearer <相同凭证>`。工具 `read_view` 返回 A 的视野，`move_piece` 接收 `dx` 和 `dy`。日志包含工具参数与结果，凭证和日志均保存在 Git 仓库外。
三席位隔离测试沿用同一个 MCP 地址。启动前为 A、B、C 分别设置 `MONDRIAN_SEAT_A_TOKEN`、`MONDRIAN_SEAT_B_TOKEN`、`MONDRIAN_SEAT_C_TOKEN`，三者必须不同。每个隔离的 WorkBuddy 会话只配置自己的连接凭证。该测试服务只提供观察和移动工具，测试期间没有聊天入口。客户端是否隔离连接器及工作区仍需实机验证。

### WorkBuddy 三席位轮换联调

配置上述三份凭证后，在同一台电脑运行以下命令，日志使用项目外的路径。

```powershell
python -B -m 模块03_桌面Agent接入与调度.MCP接入验证 --scheduled --log "$env:TEMP/mondrian-workbuddy-run.jsonl"
```

每个 WorkBuddy 会话使用同一个 MCP 地址 `http://127.0.0.1:8765/mcp`，请求头使用自己席位的 Bearer 凭证。各会话工具列表须只有自己的实验连接，且使用独立上下文。实验期间不要给 Agent 项目源码、研究者观察页、回放或日志访问权。

让三个会话执行相同指令。调用 `next_puzzle_turn`，若返回 `waiting`，隔几秒再领。若返回 `ready`，根据局部视野与公共聊天决策，调用 `submit_puzzle_turn`，函数接收原回合的 `request_id` 以及 JSON 文本 `reply`。每轮可发言、平移、旋转或等待，例如 `{"action":"chat","text":"我看到队友的线索是……"}`、`{"action":"move","dx":3,"dy":0}`、`{"action":"rotate"}`、`{"action":"wait"}`。收到 `finished` 后停止。坐标 x 向右为正，y 向下为正。

研究者核对日志中的席位、回合编号、输入、输出和回执。自动测试使用 MCP HTTP 协议和三个脚本客户端，单独运行 WorkBuddy 才能验证客户端工具权限、独立上下文和断线行为。某席位掉线时会停留在该轮。服务重启会开新局，日志用于复查。
