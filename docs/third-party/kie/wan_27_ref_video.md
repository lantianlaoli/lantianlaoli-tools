# Wan 2.7 - Reference to Video

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
      summary: Wan 2.7 - Reference to Video
      deprecated: false
      description: >-
        ## Create Task


        Use this endpoint to create a new reference-to-video generation task.


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
      operationId: wan-2-7-r2v
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
                    - wan/2-7-r2v
                  default: wan/2-7-r2v
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `wan/2-7-r2v` model.
                  examples:
                    - wan/2-7-r2v
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
                  description: Input parameters for the reference-to-video task.
                  required:
                    - prompt
                  properties:
                    prompt:
                      type: string
                      maxLength: 5000
                      description: >-
                        Text prompt. Required. Describes the desired elements
                        and visual features in the generated video. Supports
                        Chinese and English. Maximum length: 5000 characters.
                      examples:
                        - >-
                          Image 1 is eating, while video 1 and image 2 are
                          singing beside it.
                    negative_prompt:
                      type: string
                      maxLength: 500
                      description: >-
                        Optional negative prompt describing what should not
                        appear in the video. Supports Chinese and English.
                        Maximum length: 500 characters.
                      examples:
                        - >-
                          low resolution, errors, worst quality, low quality,
                          malformed, extra fingers, bad proportions
                    reference_image:
                      type: array
                      maxItems: 5
                      items:
                        type: string
                        format: uri
                      description: >-
                        Array of reference image URLs. At least one of
                        `reference_image` or `reference_video` must be provided.
                        The total number of images and videos cannot exceed 5.
                      examples:
                        - - https://example.com/demo/ref-image-1.png
                          - https://example.com/demo/ref-image-2.png
                    reference_video:
                      type: array
                      maxItems: 5
                      items:
                        type: string
                        format: uri
                      description: >-
                        Array of reference video URLs. At least one of
                        `reference_image` or `reference_video` must be provided.
                        The total number of images and videos cannot exceed 5.
                      examples:
                        - - https://example.com/demo/ref-video-1.mp4
                    first_frame:
                      type: string
                      format: uri
                      description: >-
                        First frame image URL. At most one image can be
                        provided. If supplied, `aspect_ratio` is ignored and the
                        output uses a ratio close to the first frame image.
                      examples:
                        - https://example.com/demo/first-frame.png
                    reference_voice:
                      type: string
                      format: uri
                      description: >-
                        Audio URL used to specify the voice timbre of the
                        subject in the reference material.


                        Rules:

                        - If `reference_video` contains audio and
                        `reference_voice` is not provided, the original video
                        audio is used by default

                        - If both `reference_video` and `reference_voice` are
                        provided, `reference_voice` takes priority


                        Audio limits:

                        - Formats: `wav`, `mp3`

                        - Duration: `1` to `10` seconds

                        - File size: up to `15MB`
                      examples:
                        - https://example.com/demo/reference-voice.mp3
                    resolution:
                      type: string
                      enum:
                        - 720p
                        - 1080p
                      default: 1080p
                      description: >-
                        Output video resolution tier. Available values: `720p`,
                        `1080p`. Default value: `1080p`.
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
                      default: '16:9'
                      description: >-
                        Output video aspect ratio.


                        Effective logic:

                        - If `first_frame` is not provided: the video is
                        generated using the specified `aspect_ratio`

                        - If `first_frame` is provided: `aspect_ratio` is
                        ignored and the output uses a ratio close to the first
                        frame image
                      examples:
                        - '16:9'
                    duration:
                      type: integer
                      minimum: 2
                      maximum: 10
                      default: 5
                      description: >-
                        Output video duration in seconds. Valid range is an
                        integer from `2` to `10`. Default value: `5`.
                      examples:
                        - 5
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
                  x-apidog-orders:
                    - prompt
                    - negative_prompt
                    - reference_image
                    - reference_video
                    - first_frame
                    - reference_voice
                    - resolution
                    - aspect_ratio
                    - duration
                    - prompt_extend
                    - watermark
                    - seed
                    - nsfw_checker
              x-apidog-orders:
                - model
                - callBackUrl
                - input
            example:
              model: wan/2-7-r2v
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Image 1 is eating, while video 1 and image 2 are singing
                  beside it.
                negative_prompt: >-
                  low resolution, errors, worst quality, low quality, malformed,
                  extra fingers, bad proportions
                reference_image:
                  - https://example.com/demo/ref-image-1.png
                  - https://example.com/demo/ref-image-2.png
                reference_video:
                  - https://example.com/demo/ref-video-1.mp4
                first_frame: https://example.com/demo/first-frame.png
                reference_voice: https://example.com/demo/reference-voice.mp3
                resolution: 1080p
                aspect_ratio: '16:9'
                duration: 5
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
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-32711851-run
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