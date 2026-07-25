# Wan 2.7 - Video Edit

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
      summary: Wan 2.7 - Video Edit
      deprecated: false
      description: >-
        ## Create Task


        Use this endpoint to create a new video editing generation task.


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          After submission, use the unified query endpoint to check task progress and retrieve results
        </Card>


        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Model Marketplace" icon="lucide-store" href="/market/quickstart">
            Explore all available models and capabilities
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check account credits and usage
          </Card>
        </CardGroup>
      operationId: wan-2-7-videoedit
      tags:
        - docs/en/Market/Video Models/Wan
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
                    - wan/2-7-videoedit
                  default: wan/2-7-videoedit
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `wan/2-7-videoedit` model.
                  examples:
                    - wan/2-7-videoedit
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the video editing task.
                  required:
                    - video_url
                  properties:
                    prompt:
                      type: string
                      maxLength: 5000
                      description: >-
                        Optional text prompt describing the expected elements
                        and visual features in the generated video. Supports
                        Chinese and English. Maximum length: 5000 characters.
                      examples:
                        - >-
                          Change the character's outfit and add the hat shown in
                          the reference image.
                    negative_prompt:
                      type: string
                      maxLength: 500
                      description: >-
                        Optional negative prompt describing content that should
                        not appear in the video. Supports Chinese and English.
                        Maximum length: 500 characters.
                      examples:
                        - >-
                          low resolution, errors, worst quality, low quality,
                          malformed, extra fingers, bad proportions
                    video_url:
                      type: string
                      format: uri
                      description: >-
                        URL of the source video to edit. Required. Only one
                        video is supported.


                        - Formats: `mp4`, `mov`

                        - Duration: `2` to `10` seconds

                        - Resolution: width and height range `[240,4096]` pixels

                        - Aspect ratio: `1:8` to `8:1`

                        - File size: up to `100MB`

                        - Supports public `http/https` URLs or temporary `oss`
                        URLs
                      examples:
                        - https://example.com/demo/video.mp4
                    resolution:
                      type: string
                      enum:
                        - 720p
                        - 1080p
                      default: 1080p
                      description: >-
                        Output video resolution tier. `1080p` costs more than
                        `720p`. Default value: `1080p`.


                        - `720p`: 720p

                        - `1080p`: 1080p
                      examples:
                        - 1080p
                    aspect_ratio:
                      type: string
                      enum:
                        - '16:9'
                        - '9:16'
                        - '1:1'
                        - '4:3'
                        - '3:4'
                      description: >-
                        Output video aspect ratio.


                        - If omitted: the output uses an aspect ratio close to
                        the input video

                        - If provided: the output uses the specified aspect
                        ratio

                        - Available values: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`
                      examples:
                        - '16:9'
                    duration:
                      type: integer
                      minimum: 0
                      maximum: 10
                      default: 0
                      description: >-
                        Output video duration in seconds.


                        - Default `0` means using the full input video duration
                        without truncation

                        - If a value is provided, the output is clipped from
                        second `0` to the specified length

                        - Valid values are `0` or any integer in `[2,10]`
                      examples:
                        - 0
                    audio_setting:
                      type: string
                      enum:
                        - auto
                        - origin
                      default: auto
                      description: >-
                        Video audio setting.


                        - `auto`: default, the model decides whether to
                        regenerate audio based on the `prompt`

                        - `origin`: force keeping the original input video audio
                      examples:
                        - auto
                    prompt_extend:
                      type: boolean
                      default: true
                      description: >-
                        Whether to enable prompt rewriting. When enabled, the
                        model expands the input prompt. This usually works
                        better for short prompts but increases processing time.
                      examples:
                        - true
                    watermark:
                      type: boolean
                      default: false
                      description: >-
                        Whether to add a watermark. The watermark is placed in
                        the lower-right corner of the video with the fixed text
                        "AI generated".
                      examples:
                        - false
                    seed:
                      type: integer
                      minimum: 0
                      maximum: 2147483647
                      description: >-
                        Random seed. Range: `0-2147483647`. If omitted, the
                        system generates one automatically.
                      examples:
                        - 0
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. You can set it to false based on your
                        needs. If set to false, our content filtering will be
                        disabled, and all results will be returned directly by
                        the model itself.
                    reference_image:
                      type: string
                      format: uri
                      description: >-
                        Optional reference image URL for character, clothing, or
                        style guidance.


                        - Formats: `JPEG`, `JPG`, `PNG` (no alpha channel),
                        `BMP`, `WEBP`

                        - Resolution: width and height range `[240,8000]` pixels

                        - Aspect ratio: `1:8` to `8:1`

                        - Supports public `http/https` URLs or temporary `oss`
                        URLs
                      examples:
                        - https://example.com/demo/reference.png
                  x-apidog-orders:
                    - prompt
                    - negative_prompt
                    - video_url
                    - reference_image
                    - resolution
                    - aspect_ratio
                    - duration
                    - audio_setting
                    - prompt_extend
                    - watermark
                    - seed
                    - nsfw_checker
              x-apidog-orders:
                - model
                - callBackUrl
                - input
            example:
              model: wan/2-7-videoedit
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Change the character's outfit and add the hat shown in the
                  reference image.
                negative_prompt: >-
                  low resolution, errors, worst quality, low quality, malformed,
                  extra fingers, bad proportions
                video_url: https://example.com/demo/video.mp4
                reference_image: https://example.com/demo/reference.png
                resolution: 1080p
                aspect_ratio: '16:9'
                duration: 0
                audio_setting: auto
                prompt_extend: true
                watermark: false
                seed: 0
      responses:
        '200':
          description: Request successful
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
                            description: >-
                              Task ID, which can be used to query task status
                              through the task detail endpoint.
                            examples:
                              - task_wan_1765180586443
                        x-apidog-orders:
                          - taskId
                    x-apidog-orders:
                      - data
              example:
                code: 200
                msg: success
                data:
                  taskId: task_wan_1765180586443
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
      x-apidog-folder: docs/en/Market/Video Models/Wan
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-32709057-run
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