Here’s the **English developer-friendly specification document** for the **KIE AI *kling-3.0/video*** model based on the official API docs. This is suitable for reading, integrating, and building tools around the model. ([docs.kie.ai][1])

---

# 📘 **Kling 3.0 Video Generation Model (kling-3.0/video) — Developer Documentation**

**Model:**

```json
"model": "kling-3.0/video"
```

Used in API requests to generate video content programmatically. ([docs.kie.ai][1])

---

## 🚀 1. Overview

**Kling 3.0** is an advanced AI video generation model that lets developers create short videos from text, images, and optional element references. It supports single-shot and multi-shot generation, automatic aspect ratio adaptation, and native sound effects. ([docs.kie.ai][1])

**Key Capabilities**

* **Single-shot & multi-shot video creation**
* **Element references** for characters, props, or scenes
* **Sound generation** (optional)
* **Flexible aspect ratios** (16:9, 9:16, 1:1)
* **Duration control (3–15 seconds)**
* **Selectable generation mode** (`std` / `pro`) ([docs.kie.ai][1])

---

## 📡 2. API Endpoint

**URL:**

```
POST https://api.kie.ai/api/v1/jobs/createTask
```

Every video generation task is submitted here. The endpoint returns a `taskId` you can use to later query status/results. ([docs.kie.ai][1])

### 🔐 Authentication

Include your API key in the header:

```
Authorization: Bearer YOUR_API_KEY
```

Ensure you have a valid token from KIE API key management. ([docs.kie.ai][1])

---

## 📥 3. Request Body Structure

Below is the general shape of the JSON request body:

```json
{
  "model": "kling-3.0/video",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    ...parameters...
  }
}
```

* `model`: must be `"kling-3.0/video"`
* `callBackUrl`: optional webhook URL to receive finished task notifications
* `input`: contains the generation parameters (described next) ([docs.kie.ai][1])

---

## 🧱 4. Input Parameters

### 🎯 Common Fields in `input`

| Parameter        | Type     | Required              | Description                             |                    |
| ---------------- | -------- | --------------------- | --------------------------------------- | ------------------ |
| `prompt`         | string   | ❌ only in single-shot | Main text to describe the video         |                    |
| `image_urls`     | string[] | ❌                     | Reference images (first/last frame)     |                    |
| `sound`          | bool     | ❌                     | Whether to include audio                |                    |
| `duration`       | string   | ✔                     | Total video length in seconds           |                    |
| `aspect_ratio`   | string   | ❌                     | Video aspect ratio                      |                    |
| `mode`           | string   | ❌                     | Generation quality mode                 |                    |
| `multi_shots`    | bool     | ✔                     | True if using multi-shot                |                    |
| `multi_prompt`   | object[] | ❌                     | Only for multi-shot segments            |                    |
| `kling_elements` | object[] | ❌                     | Named image/video elements to reference |                    |
| `callBackUrl`    | string   | ❌                     | Webhook for completion                  | ([docs.kie.ai][1]) |

---

## 📌 5. Detailed Fields

### 📍 prompt

A text description of the video concept. Used in **single-shot mode** (when `multi_shots:false`). ([docs.kie.ai][1])

---

### 🖼 image_urls

Array of one or two URLs pointing to images used as reference frames:

* Index 0: *Required for visual consistency (first frame)*
* Index 1: *Optional last frame reference*

If provided, the system automatically determines the aspect ratio so you can omit `aspect_ratio`. ([docs.kie.ai][1])

---

### 🔊 sound

Specifies whether to generate synchronized audio:

* `true`: include sound effects and possible speech
* `false`: mute output ([docs.kie.ai][1])

---

### ⏱ duration

The **total video duration** in seconds. Must be between **3 and 15**. ([docs.kie.ai][1])

---

### 📐 aspect_ratio

Defines the output’s shape:

Allowed values:

* `16:9` — standard landscape
* `9:16` — vertical
* `1:1` — square ([docs.kie.ai][1])

If `image_urls` are provided, this can be auto-determined. ([docs.kie.ai][1])

---

### ⚙ mode

Generation quality:

* `std`: standard resolution
* `pro`: higher resolution output ([docs.kie.ai][1])

Use `pro` for final renders and `std` for quick iteration. ([docs.kie.ai][1])

---

## 🎥 6. Multi-Shot Mode

To enable multi-shot storytelling:

```json
"multi_shots": true,
"multi_prompt": [
  {"prompt":"Scene 1 description", "duration": 3},
  {"prompt":"Scene 2 description", "duration": 5}
]
```

* Each object in `multi_prompt` is a segment
* Each segment must have its own prompt and duration (1–12s)
* Only the *first* image in `image_urls` is used in multi-shot mode ([docs.kie.ai][1])

---

## 🔖 7. Element References (`kling_elements`)

You can embed reusable **elements** (characters, objects, videos) and reference them in prompts using the syntax `@element_name`. ([docs.kie.ai][1])

```json
"kling_elements": [
  {
    "name": "element_x",
    "description": "ele description",
    "element_input_urls": ["…","…"],
    "element_input_video_urls": ["…"]
  }
]
```

### Element types

| Element Type  | Fields                     | Notes                           |                    |
| ------------- | -------------------------- | ------------------------------- | ------------------ |
| Image element | `element_input_urls`       | 2–4 JPG/PNG URLs, max 10MB each |                    |
| Video element | `element_input_video_urls` | 1 MP4/MOV, max 50MB             | ([docs.kie.ai][1]) |

Make sure the `name` matches exactly what you use with `@name` in prompts. ([docs.kie.ai][1])

---

## 📤 8. Example Requests

### **Single-Shot Example**

```json
{
  "model": "kling-3.0/video",
  "input": {
    "prompt": "A peaceful seaside sunset scene",
    "duration": "7",
    "sound": true,
    "aspect_ratio": "16:9",
    "mode": "pro"
  }
}
```

### **Multi-Shot Example with Elements**

```json
{
  "model": "kling-3.0/video",
  "input": {
    "multi_shots": true,
    "image_urls": ["https://…start.png"],
    "multi_prompt": [
      { "prompt": "A dog runs@element_dog", "duration": 4 },
      { "prompt": "The dog jumps@element_dog", "duration": 5 }
    ],
    "kling_elements": [
      {
        "name": "element_dog",
        "description": "dog",
        "element_input_urls": ["https://…dog1.png","https://…dog2.png"]
      }
    ],
    "sound": true,
    "mode": "pro"
  }
}
```

(These examples mirror official usage patterns.) ([docs.kie.ai][1])

---

## 🔄 9. Getting Results

### 📊 Task Submission Response

Successful task creation returns:

```json
{
  "code": 200,
  "msg": "success",
  "data": { "taskId": "task_kling-3.0_XXXXXXXX" }
}
```

Use `taskId` to fetch results. ([docs.kie.ai][1])

---

### 📡 Query Progress / Result

Use the task details endpoint to check status and obtain the output video URL(s). (Polling or webhook callbacks recommended.) ([docs.kie.ai][1])

---

## 🚨 10. Errors You May Encounter

| Code  | Meaning                |                    |
| ----- | ---------------------- | ------------------ |
| `401` | Unauthorized (bad key) |                    |
| `402` | Insufficient credits   |                    |
| `422` | Validation error       |                    |
| `429` | Too many requests      |                    |
| `501` | Generation failed      |                    |
| `505` | Feature disabled       | ([docs.kie.ai][1]) |

---

## 🧠 11. Best Practices

✔ Write detailed prompts with explicit action, camera, and motion info.
✔ Use high-quality element URLs for better consistency.
✔ Use `pro` for final output, `std` for fast iterations.
✔ Use multi-shot to segment longer or narrative videos. ([docs.kie.ai][1])

---

If you want, I can also generate **Python / JavaScript API client code** that wraps this in reusable functions. Would you like that?

[1]: https://docs.kie.ai/market/kling/kling-3.0?utm_source=chatgpt.com "Kling 3.0 - KIE API"
