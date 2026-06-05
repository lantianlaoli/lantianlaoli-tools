# Nano Banana 2

Source pages:

- https://kie.ai/nano-banana-2
- https://kie.ai/model/nano-banana-2.md

Model identifier:

- `nano-banana-2`

This model supports text-to-image and image-to-image generation through the
standard KIE task creation endpoint:

- `POST https://api.kie.ai/api/v1/jobs/createTask`

Recommended request example:

```json
{
  "model": "nano-banana-2",
  "input": {
    "prompt": "Create a clean commercial hero image of the product on a bright kitchen counter.",
    "image_input": [
      "https://example.com/reference-1.png"
    ],
    "aspect_ratio": "9:16",
    "resolution": "1K",
    "output_format": "png",
    "google_search": false
  },
  "callBackUrl": "https://your-app.example.com/api/avatar-ads/webhooks/image"
}
```

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `prompt` | string | Yes | Text instruction for the generated image |
| `image_input` | string[] | No | Reference images for image-to-image or grounded image generation |
| `aspect_ratio` | string | No | Example values: `1:1`, `9:16`, `16:9`, `3:4`, `4:3`, `2:3`, `3:2`, `4:5`, `5:4`, `21:9` |
| `resolution` | string | No | Supported on the KIE page: `1K`, `2K`, `4K` |
| `output_format` | string | No | Use `png` or `jpg` |
| `google_search` | boolean | No | Enables Google Web Search grounding |
| `callBackUrl` | string | No | Webhook URL notified when generation finishes |

Project defaults for Flowtra:

- `resolution = "1K"`
- `google_search = false`
- `output_format = "png"`

Notes:

- The runtime `model` value must be `nano-banana-2`.
- The `.md` URL above is kept only as a documentation reference source.
- Do not send the documentation URL as the `model` field.
