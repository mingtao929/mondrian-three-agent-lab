// Provider metadata, verified against official documentation on 2026-10-25.
// A preset is not proof that the user's account has model access.
export const PRESETS={
 ustc:{label:'中科大公共平台 · 学校 Key 专用',endpoint:'https://api.llm.ustc.edu.cn/v1',models:['deepseek-flash','qwen-chat'],source:'https://llm.ustc.edu.cn/guide/api-usage/'},
 doubao:{label:'豆包 · 火山方舟',endpoint:'https://ark.cn-beijing.volces.com/api/v3',models:['doubao-seed-2-1-pro-260915'],source:'https://docs.volcengine.com/docs/ark/deep-thinking'},
 deepseek:{label:'DeepSeek',endpoint:'https://api.deepseek.com',models:['deepseek-flash','deepseek-v4-pro'],source:'https://api-docs.deepseek.com/'},
 qwen:{label:'通义千问',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1',models:['qwen-plus'],source:'https://help.aliyun.com/zh/model-studio/use-qwen-by-calling-api'},
 glm:{label:'智谱 GLM',endpoint:'https://open.bigmodel.cn/api/paas/v4',models:['glm-4.7'],source:'https://docs.bigmodel.cn/cn/guide/start/model-overview'},
 kimi:{label:'Kimi',endpoint:'https://api.moonshot.cn/v1',models:['kimi-k2.6','kimi-k3.1-pro'],source:'https://platform.kimi.com/docs/api/chat'},
 openai:{label:'OpenAI API',endpoint:'https://api.openai.com/v1',models:['gpt-4.1'],source:'https://developers.openai.com/api/docs/models/gpt-4.1'}
};
export function inferPreset(c={}){if(c.preset)return c.preset;return c.kind==='openai'?(Object.keys(PRESETS).find(p=>PRESETS[p].endpoint===c.endpoint)||'custom'):'custom';}
