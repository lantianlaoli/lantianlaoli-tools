# Gemini Omni 生视频

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Gemini Omni 生视频
      deprecated: false
      description: >-
        ## 创建任务


        调用该接口可创建一个新的多模态视频生成任务。


        <Card title="查询任务详情" icon="lucide-search"
        href="/cn/market/common/get-task-detail">
          提交任务后，可通过统一查询接口查看任务进度并获取生成结果
        </Card>


        ::: tip[]

        生产环境建议优先使用 `callBackUrl` 参数接收任务完成通知，而不是持续轮询任务状态接口。

        :::


        ## 相关资源


        <CardGroup cols={2}>
          <Card title="模型市场" icon="lucide-store" href="/market/quickstart">
            浏览全部可用模型与能力
          </Card>
          <Card title="通用 API" icon="lucide-cog" href="/common-api/get-account-credits">
            查看账户积分与调用情况
          </Card>
        </CardGroup>
      operationId: gemini-omni-video-zh
      tags:
        - docs/zh-CN/Market/Video Models/Gemini Omni
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - gemini-omni-video
                  default: gemini-omni-video
                  description: 用于生成任务的模型名称。该字段为必填项。此接口必须使用 `gemini-omni-video` 模型。
                  examples:
                    - gemini-omni-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    任务完成通知的回调 URL。该参数为可选项。如果提供，当任务完成时，无论成功或失败，系统都会向该 URL 发送 POST
                    请求。如果未提供，则不会发送回调通知。
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: 多模态视频生成任务的输入参数。
                  properties:
                    prompt:
                      type: string
                      description: 视频提示词，用于描述目标视频的画面内容、风格、镜头语言或角色行为。
                      examples:
                        - 生成一个未来感十足的城市夜景短片，镜头缓慢推进，角色从霓虹街道中走出。
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: |-
                        图片地址数组。可上传多张参考图片，用于提供角色、场景、风格或分镜参考。

                        图片限制：
                        - 单个文件大小不超过 `20MB`
                        - 请使用可公开访问的图片 URL
                        - 最大7张图
                      examples:
                        - - https://example.com/assets/scene-1.png
                          - https://example.com/assets/scene-2.png
                    audio_ids:
                      type: array
                      items:
                        type: string
                      description: >-
                        由 `gemini-omni-audio` 接口生成的音频 ID
                        数组。用于为视频提供旁白、对白、配乐或声音参考。最多3个。
                      examples:
                        - - audio_01hx8p0demo
                    video_list:
                      type: array
                      items:
                        type: object
                        required:
                          - url
                          - start
                          - ends
                        properties:
                          url:
                            type: string
                            format: uri
                            description: 视频地址。单个视频文件大小不超过 `100MB`，视频时长不超过 `30s`。
                          start:
                            type: number
                            minimum: 0
                            description: 起始时间，单位为秒。
                          ends:
                            type: number
                            minimum: 0
                            description: 结束时间，单位为秒。应大于 `start`。结束与起始时间之差不超过10秒
                        x-apidog-orders:
                          - url
                          - start
                          - ends
                      description: |-
                        视频片段数组。每个元素描述一个可参与生成的视频素材及其截取时间范围。

                        视频限制：
                        - 单个文件大小不超过 `100MB`
                        - 视频时长不超过 `30s`
                        - `ends` 应大于 `start`
                        - 结束与起始时间之差不超过`10s`
                        - 最多1个，占用两张图
                      examples:
                        - - url: https://example.com/assets/source-video.mp4
                            start: 0
                            ends: 20
                    character_ids:
                      type: array
                      items:
                        type: string
                      description: >-
                        由 `gemini-omni-character` 接口生成的角色 ID
                        数组。用于为视频提供角色外观、身份或人物参考。每个 character_id 会占用 1 个 image
                        slot；基础最多 7 个，若同时传入 video_list，则 video_list 占用 2 个 image
                        slots，character_ids 最多 3 个。
                      examples:
                        - - character_01hx8p0demo
                    duration:
                      type: string
                      enum:
                        - '4'
                        - '6'
                        - '8'
                        - '10'
                      description: 生成视频的时长，单位为秒。可选值为 4、6、8、10。
                      examples:
                        - '8'
                    aspect_ratio:
                      type: string
                      enum:
                        - '16:9'
                        - '9:16'
                      description: 生成视频的画面宽高比。`16:9` 为横屏视频，`9:16` 为竖屏视频。
                      examples:
                        - '16:9'
                    seed:
                      type: integer
                      description: >-
                        随机种子。取值范围：[0, 2147483647]。如果不指定，系统会自动生成一个 seed。固定 seed
                        可以提高结果的可复现性，但由于模型本身具有随机性，结果仍可能存在差异。
                  x-apidog-orders:
                    - prompt
                    - image_urls
                    - audio_ids
                    - video_list
                    - character_ids
                    - duration
                    - aspect_ratio
                    - seed
                  required:
                    - prompt
                    - duration
                    - aspect_ratio
              x-apidog-orders:
                - model
                - callBackUrl
                - input
            example:
              model: gemini-omni-video
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: 生成一个未来感十足的城市夜景短片，镜头缓慢推进，角色从霓虹街道中走出。
                image_urls:
                  - https://example.com/assets/scene-1.png
                  - https://example.com/assets/scene-2.png
                audio_ids:
                  - audio_01hx8p0demo
                video_list:
                  - url: https://example.com/assets/source-video.mp4
                    start: 0
                    ends: 10
      responses:
        '200':
          description: 请求成功
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties: {}
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: 任务 ID，可用于调用任务详情接口查询任务状态。
                            examples:
                              - task_gemini_1765180586443
                        x-apidog-orders:
                          - taskId
                    x-apidog-orders:
                      - data
              example:
                code: 200
                msg: success
                data:
                  taskId: task_gemini_1765180586443
          headers: {}
          x-apidog-name: ''
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/zh-CN/Market/Video Models/Gemini Omni
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-36213533-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 都需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意事项：
        - 请妥善保管您的 API Key，切勿泄露给他人
        - 若怀疑 API Key 泄露，请立即在管理页面重置
    BearerAuth1:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 都需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意事项：
        - 请妥善保管您的 API Key，切勿泄露给他人
        - 若怀疑 API Key 泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```