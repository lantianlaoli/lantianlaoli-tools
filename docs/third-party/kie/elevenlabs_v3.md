# Text To Dialogue V3 API Documentation

> Generate content using the Text To Dialogue V3 model

## Overview

This document describes how to use the Text To Dialogue V3 model for content generation. The process consists of two steps:
1. Create a generation task
2. Query task status and results

## Authentication

All API requests require a Bearer Token in the request header:

```
Authorization: Bearer YOUR_API_KEY
```

Get API Key:
1. Visit [API Key Management Page](https://kie.ai/api-key) to get your API Key
2. Add to request header: `Authorization: Bearer YOUR_API_KEY`

---

## 1. Create Generation Task

### API Information
- **URL**: `POST https://api.kie.ai/api/v1/jobs/createTask`
- **Content-Type**: `application/json`

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | Model name, format: `elevenlabs/text-to-dialogue-v3` |
| input | object | Yes | Input parameters object |
| callBackUrl | string | No | Callback URL for task completion notifications. If provided, the system will send POST requests to this URL when the task completes (success or fail). If not provided, no callback notifications will be sent. Example: `"https://your-domain.com/api/callback"` |

### Model Parameter

The `model` parameter specifies which AI model to use for content generation.

| Property | Value | Description |
|----------|-------|-------------|
| **Format** | `elevenlabs/text-to-dialogue-v3` | The exact model identifier for this API |
| **Type** | string | Must be passed as a string value |
| **Required** | Yes | This parameter is mandatory for all requests |

> **Note**: The model parameter must match exactly as shown above. Different models have different capabilities and parameter requirements.

### Callback URL Parameter

The `callBackUrl` parameter allows you to receive automatic notifications when your task completes.

| Property | Value | Description |
|----------|-------|-------------|
| **Purpose** | Task completion notification | Receive real-time updates when your task finishes |
| **Method** | POST request | The system sends POST requests to your callback URL |
| **Timing** | When task completes | Notifications sent for both success and failure states |
| **Content** | Query Task API response | Callback content structure is identical to the Query Task API response |
| **Parameters** | Complete request data | The `param` field contains the complete Create Task request parameters, not just the input section |
| **Optional** | Yes | If not provided, no callback notifications will be sent |

**Important Notes:**
- The callback content structure is identical to the Query Task API response
- The `param` field contains the complete Create Task request parameters, not just the input section  
- If `callBackUrl` is not provided, no callback notifications will be sent

### input Object Parameters

#### dialogue
- **Type**: `unknown`
- **Required**: Not explicitly stated on the KIE page
- **Description**: Dialogue input field shown in the KIE form UI for this model.
- **Visible UI Label**: `Dialogue`
- **Visible Limit**: `5000` characters (shown in the UI as `0 / 5000`)
- **Form Behavior**: Supports adding dialogue entries via `+ Add dialogue`

> **KIE-only verification note**: KIE exposes `dialogue` in the form UI, but the page's `View expected fields` summary does not expand its internal schema. The nested structure of `dialogue` is not publicly expanded on the KIE page as of March 12, 2026.

#### stability
- **Type**: `number`
- **Required**: No
- **Description**: Determines how stable the voice is and the randomness between each generation.
- **Range**: 0 - 1 (step: 0.5)
- **Default Value**: `0.5`

#### language_code
- **Type**: `string`
- **Required**: No
- **Description**: Language selection field for the generated dialogue audio.
- **Options**:
  - `auto`: Auto
  - `af`: Afrikaans
  - `ar`: Arabic
  - `hy`: Armenian
  - `as`: Assamese
  - `az`: Azerbaijani
  - `be`: Belarusian
  - `bn`: Bengali
  - `bs`: Bosnian
  - `bg`: Bulgarian
  - `ca`: Catalan
  - `ceb`: Cebuano
  - `ny`: Chichewa
  - `hr`: Croatian
  - `cs`: Czech
  - `da`: Danish
  - `nl`: Dutch
  - `en`: English
  - `et`: Estonian
  - `fil`: Filipino
  - `fi`: Finnish
  - `fr`: French
  - `gl`: Galician
  - `ka`: Georgian
  - `de`: German
  - `el`: Greek
  - `gu`: Gujarati
  - `ha`: Hausa
  - `he`: Hebrew
  - `hi`: Hindi
  - `hu`: Hungarian
  - `is`: Icelandic
  - `id`: Indonesian
  - `ga`: Irish
  - `it`: Italian
  - `ja`: Japanese
  - `jv`: Javanese
  - `kn`: Kannada
  - `kk`: Kazakh
  - `ky`: Kirghiz
  - `ko`: Korean
  - `lv`: Latvian
  - `ln`: Lingala
  - `lt`: Lithuanian
  - `lb`: Luxembourgish
  - `mk`: Macedonian
  - `ms`: Malay
  - `ml`: Malayalam
  - `zh`: Mandarin Chinese
  - `mr`: Marathi
  - `ne`: Nepali
  - `no`: Norwegian
  - `ps`: Pashto
  - `fa`: Persian
  - `pl`: Polish
  - `pt`: Portuguese
  - `pa`: Punjabi
  - `ro`: Romanian
  - `ru`: Russian
  - `sr`: Serbian
  - `sd`: Sindhi
  - `sk`: Slovak
  - `sl`: Slovenian
  - `so`: Somali
  - `es`: Spanish
  - `sw`: Swahili
  - `sv`: Swedish
  - `ta`: Tamil
  - `te`: Telugu
  - `th`: Thai
  - `tr`: Turkish
  - `uk`: Ukrainian
  - `ur`: Urdu
  - `vi`: Vietnamese
  - `cy`: Welsh
- **Default Value**: `"auto"`

### Verification Notes

- Verified against the KIE page for `elevenlabs/text-to-dialogue-v3` on **March 12, 2026**.
- The page visibly exposes three input controls in the form UI: `Dialogue`, `stability`, and `language_code`.
- The page's `View expected fields` summary lists only `stability` and `language_code`; it does **not** expand `dialogue`.
- The page presents the output type as **audio**, so success results for this model should be treated as audio/media output unless a live API response shows otherwise.

### Request Example

```json
{
  "model": "elevenlabs/text-to-dialogue-v3",
  "input": {
    "dialogue": "[Form-visible dialogue input; nested schema not publicly expanded on the KIE page]",
    "stability": 0.5,
    "language_code": "auto"
  }
}
```

> **Example note**: The `dialogue` example above documents the field as shown in the KIE form UI. It is intentionally generic because the KIE page does not publicly expand the nested `dialogue` schema.

### Response Example

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "281e5b0*********************f39b9"
  }
}
```

### Response Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| code | integer | Response status code, 200 indicates success |
| msg | string | Response message |
| data.taskId | string | Task ID for querying task status |

---

## 2. Query Task Status

### API Information
- **URL**: `GET https://api.kie.ai/api/v1/jobs/recordInfo`
- **Parameter**: `taskId` (passed via URL parameter)

### Request Example
```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=281e5b0*********************f39b9
```

### Response Example

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "281e5b0*********************f39b9",
    "model": "elevenlabs/text-to-dialogue-v3",
    "state": "waiting",
    "param": "{\"model\":\"elevenlabs/text-to-dialogue-v3\",\"input\":{\"dialogue\":\"[Form-visible dialogue input]\",\"stability\":0.5,\"language_code\":\"auto\"}}",
    "resultJson": "",
    "failCode": null,
    "failMsg": null,
    "costTime": null,
    "completeTime": null,
    "createTime": 1757584164490
  }
}
```

### Response Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| code | integer | Response status code, 200 indicates success |
| msg | string | Response message |
| data.taskId | string | Task ID |
| data.model | string | Model name used |
| data.state | string | Task status: `waiting`(waiting),  `success`(success), `fail`(fail) |
| data.param | string | Task parameters (JSON string) |
| data.resultJson | string | Task result (JSON string, available when task is success). This model's KIE page presents the output type as `audio`, so successful results should be treated as audio/media output payloads (for example, media URLs) rather than a generic text object unless a live API response shows otherwise. |
| data.failCode | string | Failure code (available when task fails) |
| data.failMsg | string | Failure message (available when task fails) |
| data.costTime | integer | Task duration in milliseconds (available when task is success) |
| data.completeTime | integer | Completion timestamp (available when task is success) |
| data.createTime | integer | Creation timestamp |

---

## Usage Flow

1. **Create Task**: Call `POST https://api.kie.ai/api/v1/jobs/createTask` to create a generation task
2. **Get Task ID**: Extract `taskId` from the response
3. **Wait for Results**: 
   - If you provided a `callBackUrl`, wait for the callback notification
   - If no `callBackUrl`, poll status by calling `GET https://api.kie.ai/api/v1/jobs/recordInfo`
4. **Get Results**: When `state` is `success`, extract the generated audio/media result from `resultJson`

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Request successful |
| 400 | Invalid request parameters |
| 401 | Authentication failed, please check API Key |
| 402 | Insufficient account balance |
| 404 | Resource not found |
| 422 | Parameter validation failed |
| 429 | Request rate limit exceeded |
| 500 | Internal server error |
