---
name: lantianlaoli-tools-model-integration
description: lantianlaoli-tools 项目接入新图片 / 视频模型的部署 skill
---

# lantianlaoli-tools 模型接入 skill

本 skill 指导 AI agent 在已经部署好的 `lantianlaoli-tools` 项目中接入新模型。本 skill 不指定具体模型，由用户在使用时提供模型 API 文档。

前置条件：项目已经按 `lantianlaoli-tools-tutorial` skill 完成部署。

---

## 第 1 步：保存模型文档

让用户把新模型的官方 API 文档（OpenAPI / Markdown / 文档站链接）保存到项目 `docs/` 目录下，命名建议：

```
docs/<provider-slug>/<model-name>.md
```

例如：`docs/<provider-slug>/gemini-omni-video.md`

如果模型属于新的服务商，先在 `docs/` 下建立对应文件夹。

---

## 第 2 步：让 codex 阅读模型文档

在 codex 的输入框中通过 `@docs/<provider-slug>/<model-name>.md` 引用文档，发送以下 prompt：

```text
请阅读我刚引用的这份模型文档，掌握它的：

- 请求端点（endpoint）
- 请求方法（GET / POST）
- 鉴权方式（Authorization 头、API Key 字段）
- 请求 body 字段含义（必填 / 选填、取值范围、单位）
- 响应结构（如何拿到生成结果 / 任务 ID）

然后告诉我：

1. 这个模型适合做图片生成还是视频生成
2. 关键参数（分辨率、时长、宽高比、随机种子等）的可选值
3. 鉴权信息需要放在环境变量里的什么字段

不要修改任何代码，先只告诉我这些信息。
```

等 codex 返回总结后，根据用户需求把模型接入到项目内置的 Next.js API 路由。

---

## 第 3 步：实现模型接入

让 codex 基于它学到的 API 结构，在项目中实现：

- 类型定义（请求参数、响应结构）
- API 调用封装函数
- Next.js API Route（放在 `src/app/api/<model-name>/` 下）
- 前端调用组件（如有需要）

实现完成后：

1. 运行 `pnpm build` 确认无编译错误
2. 运行 `pnpm typecheck` 确认无类型错误
3. 启动 dev server，手动触发一次，确认能拿到模型生成结果

---

## 完成后

新模型接入完成。用户可以：

- 在前端页面调用新的 API Route 测试模型效果
- 基于新模型扩展已有的轮播图、详情页等功能