# Facebook Reverse Engineering Notes

**Observed Date**: September 2026  
**Target Surface**: Facebook Desktop Web (Unauthenticated / Incognito)  
**Investigation Tool**: Chrome DevTools (Network & Application Panels)  

---

## 1. Classification Matrix

| Item | Classification | Description |
|---|---|---|
| Logged-Out Mode Accessibility | **CONFIRMED** | Public posts expose the "People who shared this" dialog without requiring login. `__user = 0` is sent in requests. |
| GraphQL Endpoint | **CONFIRMED** | `https://www.facebook.com/api/graphql/` receives all data queries via POST. |
| Friendly Name | **CONFIRMED** | Query name is `CometResharesFeedPaginationQuery`. |
| Caller Class | **CONFIRMED** | Request parameter `fb_api_caller_class = RelayModern`. |
| Outer `creation_time` | **CONFIRMED** | `edge.node.creation_time` represents the exact Unix timestamp (seconds) of the reshare. |
| Inner Attached `creation_time` | **CONFIRMED** | `edge.node.attached_story.creation_time` represents the original post's timestamp, NOT the share time. |
| Lazy Loading | **CONFIRMED** | Scrolling the reshares dialog triggers GraphQL pagination queries. |
| `doc_id` Stability | **INFERRED** | Observed doc_id `28947339021537955` is volatile across Facebook frontend deployments. |
| Cursor Pagination | **CONFIRMED** | `reshares.page_info` supplies `end_cursor` and `has_next_page`. |
| Max Public Reshares Displayed | **UNKNOWN** | Total number of visible public reshares may be throttled or capped server-side by Facebook. |

---

## 2. Request Details

### HTTP Method & URL
```http
POST https://www.facebook.com/api/graphql/
Content-Type: application/x-www-form-urlencoded
```

### Key Request Form Parameters
```form-data
__user: 0
__a: 1
fb_api_caller_class: RelayModern
fb_api_req_friendly_name: CometResharesFeedPaginationQuery
variables: {"count":1,"cursor":"...","feedLocation":"SHARE_OVERLAY","feedbackSource":1,"renderLocation":"reshares_dialog","scale":1,"id":"<feedback_id>"}
doc_id: 28947339021537955
```

> **Warning**: Never rely on a hardcoded `doc_id`. Facebook regularly rebuilds its frontend GraphQL registry and reassigns query IDs. The friendly name `CometResharesFeedPaginationQuery` provides the durable contract.

---

## 3. Response Structure & Disambiguation

A typical response from Facebook RelayModern:

```json
{
  "data": {
    "node": {
      "__typename": "Feedback",
      "id": "ZmVlZGJhY2s6NDkxNDI5MzA3NTUyMzU3Mg==",
      "reshares": {
        "edges": [
          {
            "node": {
              "__typename": "Story",
              "post_id": "4914293075523572",
              "creation_time": 1785512929,
              "comet_sections": {
                "context_layout": {
                  "story": {
                    "actors": [
                      {
                        "__typename": "User",
                        "id": "100001234567890",
                        "name": "Bim Bi",
                        "profile_url": "https://www.facebook.com/profile.php?id=100001234567890"
                      }
                    ]
                  }
                }
              },
              "permalink_url": "https://www.facebook.com/example/posts/4914293075523572",
              "attached_story": {
                "__typename": "Story",
                "post_id": "1000987654321",
                "creation_time": 1753949084
              }
            }
          }
        ],
        "page_info": {
          "end_cursor": "YXJyYXljb25uZWN0aW9uOjE=",
          "has_next_page": true
        }
      }
    }
  }
}
```

### Critical Rules for Timestamp Extraction

1. **CANONICAL SHARE TIMESTAMP**:
   ```typescript
   const shareTime = edge.node.creation_time; // Correct: 1785512929 (Unix seconds)
   ```
2. **ATTACHED STORY TIMESTAMP**:
   ```typescript
   const originalTime = edge.node.attached_story.creation_time; // 1753949084
   ```
   *Do NOT extract this as the share time!* This is when the original author published the original post.

3. **FORBIDDEN PATTERN**:
   ```typescript
   // NEVER DO THIS:
   function recursiveFindCreationTime(obj: any): number {
     if (obj?.creation_time) return obj.creation_time;
     // ...
   }
   ```
   A recursive search risks picking the nested `attached_story.creation_time` or another metadata timestamp.

---

## 4. UI Behavior Observations

- **Login Wall Evasion**: Accessing the post in a pristine incognito context does not immediately trigger an impassable login modal. An unobtrusive banner or modal may appear, which can be closed or ignored while interacting with post elements.
- **Scroll Container Mechanics**: Facebook embeds the reshares feed inside a modal dialog container (`role="dialog"`). The outer browser window does not scroll. Instead, scrolling must be targeted directly at the scrollable element within the dialog.
- **Batching & Stream Framing**: Some Facebook responses arrive framed as `for (;;);{"data":...}` or newline-delimited multipart chunks. The parser must clean control prefixes before parsing JSON.
